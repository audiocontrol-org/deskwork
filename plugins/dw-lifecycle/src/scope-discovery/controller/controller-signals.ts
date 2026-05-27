/**
 * plugins/dw-lifecycle/src/scope-discovery/controller/controller-signals.ts
 *
 * Phase 11 Task 5 — Signal computation helpers.
 *
 * Pure functions that derive the three controller signals (drift,
 * correction, auditor-correction-rate) from a current metrics snapshot
 * vs the prior snapshot + recent audit-log entries.
 *
 * Extracted from `controller.ts` to keep that file under the project
 * 300-500 line cap. The split is along a natural boundary: signals are
 * scalar derivations from inputs; the controller's policy logic
 * (which field to adjust, how to clamp, etc.) lives in
 * `controller-policies.ts`.
 */

import type {
  MetricsSnapshot,
  RecentAuditEntry,
} from './controller-types.js';

/**
 * One metric's directional contribution to drift / correction.
 *
 *   - direction === -1 → toward-better (the metric moved in the
 *     direction the regime wants).
 *   - direction === +1 → toward-worse (the metric moved away from the
 *     direction the regime wants).
 *   - direction === 0 → stable / no signal (delta < eps for that
 *     metric).
 *
 * Per-metric epsilons are documented at the call sites in
 * `computeDriftAndCorrection`.
 */
export interface MetricContribution {
  readonly direction: -1 | 0 | 1;
}

/** Compute one metric's directional contribution. Stable iff |delta| < eps. */
export function metricContribution(
  prior: number,
  current: number,
  towardBetter: 'increasing' | 'decreasing',
  eps: number,
): MetricContribution {
  const delta = current - prior;
  if (Math.abs(delta) < eps) return { direction: 0 };
  const isIncreasing = delta > 0;
  if (towardBetter === 'increasing') {
    return { direction: isIncreasing ? -1 : 1 };
  }
  return { direction: isIncreasing ? 1 : -1 };
}

/**
 * Compute drift + correction from a most-recent prior metrics snapshot
 * vs the current snapshot. Both are bounded [0, 1]: fraction of
 * contributing metrics whose direction is toward-worse / toward-better.
 *
 * `catalog_edit_rate` does NOT contribute (no toward-better direction).
 *
 * `median_disposition_latency_ms` only contributes when both snapshots
 * carry a non-null value (null means no transitions observed; we don't
 * synthesize a drift signal from absence).
 *
 * Eps for stability: we use a small absolute threshold (1e-6 for
 * ratios; 0.5 hits for violation density; 1 ms for latency). These
 * are conservative — the controller should respond to genuine moves,
 * not floating-point noise.
 */
export function computeDriftAndCorrection(
  prior: MetricsSnapshot,
  current: MetricsSnapshot,
): { readonly drift: number; readonly correction: number } {
  const contributions: MetricContribution[] = [
    metricContribution(
      prior.classification_completeness,
      current.classification_completeness,
      'increasing',
      1e-6,
    ),
    metricContribution(
      prior.average_coverage,
      current.average_coverage,
      'increasing',
      1e-6,
    ),
    metricContribution(
      prior.violation_density,
      current.violation_density,
      'decreasing',
      0.5,
    ),
    metricContribution(
      prior.average_surface_variance,
      current.average_surface_variance,
      'decreasing',
      1e-6,
    ),
    metricContribution(
      prior.pending_count,
      current.pending_count,
      'decreasing',
      0.5,
    ),
  ];
  if (
    prior.median_disposition_latency_ms !== null &&
    current.median_disposition_latency_ms !== null
  ) {
    contributions.push(
      metricContribution(
        prior.median_disposition_latency_ms,
        current.median_disposition_latency_ms,
        'decreasing',
        1,
      ),
    );
  }
  // Filter out stable contributions to avoid inflating the denominator
  // with zero-signal metrics.
  const movingContributions = contributions.filter((c) => c.direction !== 0);
  if (movingContributions.length === 0) {
    return { drift: 0, correction: 0 };
  }
  let worse = 0;
  let better = 0;
  for (const c of movingContributions) {
    if (c.direction === 1) worse += 1;
    else if (c.direction === -1) better += 1;
  }
  return {
    drift: worse / movingContributions.length,
    correction: better / movingContributions.length,
  };
}

/**
 * Auditor-driven catalog edit count, normalised to a [0, 1] rate.
 *
 * Per Phase 11 Task 5 PRD: an auditor-driven edit is an audit-log
 * entry whose `provenance.source` is `'llm-judge-proposed'` OR which
 * is operator-authored with `context: audit-finding-*`. The
 * controller treats this as the TRUTH SIGNAL — the metric ratchets up
 * when the regime's own self-measurement is consistently
 * undercounting drift.
 *
 * Saturation: a rate > 1.0 / turn (more than one auditor edit per
 * turn) saturates to 1.0. Below that, the rate is simply
 * `count / max(1, prior decisions to compare against)`. Cold-start
 * (no history) uses denominator 1 so a single audit entry produces
 * rate=1.0 (maximum suspicion).
 */
export function computeAuditorCorrectionRate(
  auditEntries: ReadonlyArray<RecentAuditEntry>,
  historyLength: number,
): number {
  let count = 0;
  for (const e of auditEntries) {
    if (e.provenance === 'llm-judge-proposed') {
      count += 1;
      continue;
    }
    if (e.context !== undefined && e.context.startsWith('audit-finding-')) {
      count += 1;
    }
  }
  if (count === 0) return 0;
  // Denominator: max(1, history length). Cold-start with audit entries
  // produces rate=count (capped at 1.0 below).
  const denom = Math.max(1, historyLength);
  const rate = count / denom;
  return rate > 1.0 ? 1.0 : rate;
}
