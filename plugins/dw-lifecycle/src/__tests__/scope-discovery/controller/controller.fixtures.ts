/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/controller/controller.fixtures.ts
 *
 * Shared fixture builders for Phase 11 Task 5 controller tests.
 * Co-located with the test files; not part of the production module
 * (no entry in src/scope-discovery/controller/).
 */

import { DEFAULT_CONTROLLER_CONFIG } from '../../../scope-discovery/controller/controller-config.js';
import type {
  ControllerConfig,
  ControllerHistoryEntry,
  ControllerInput,
  MetricsSnapshot,
  RecentAuditEntry,
} from '../../../scope-discovery/controller/controller-types.js';

/**
 * Mid-range metrics. Tests override individual fields to inject
 * drift / correction signals.
 */
export function baseMetrics(
  overrides: Partial<MetricsSnapshot> = {},
): MetricsSnapshot {
  return {
    classification_completeness: 0.8,
    average_coverage: 0.7,
    violation_density: 100,
    average_surface_variance: 0.2,
    catalog_edit_rate: 1.0,
    pending_count: 10,
    median_disposition_latency_ms: 60000,
    ...overrides,
  };
}

export function makeHistoryEntry(
  decision: {
    frequency: number;
    intensity: number;
    escalationThreshold: number;
    drift: number;
    correction: number;
    auditorCorrectionRate: number;
    decided_at: string;
    audit_trail?: ControllerHistoryEntry['decision']['audit_trail'];
  },
  metrics: MetricsSnapshot,
): ControllerHistoryEntry {
  return {
    decision: {
      frequency: decision.frequency,
      intensity: decision.intensity,
      escalationThreshold: decision.escalationThreshold,
      signals: {
        drift: decision.drift,
        correction: decision.correction,
        auditorCorrectionRate: decision.auditorCorrectionRate,
      },
      audit_trail: decision.audit_trail ?? [],
      decided_at: decision.decided_at,
    },
    metrics_snapshot: metrics,
  };
}

export function makeInput(args: {
  readonly currentMetrics: MetricsSnapshot;
  readonly history: ReadonlyArray<ControllerHistoryEntry>;
  readonly auditEntries?: ReadonlyArray<RecentAuditEntry>;
  readonly config?: ControllerConfig;
  readonly decidedAt?: string;
}): ControllerInput {
  return {
    currentMetrics: args.currentMetrics,
    history: args.history,
    auditEntries: args.auditEntries ?? [],
    config: args.config ?? DEFAULT_CONTROLLER_CONFIG,
    decidedAt: args.decidedAt ?? '2026-05-26T12:00:00Z',
  };
}

/**
 * Convenience: a worsened metrics snapshot that drives drift past
 * the default high_drift_threshold against `baseMetrics()`. Coverage
 * ↓, completeness ↓, violation density ↑, pending ↑, variance ↑.
 */
export function worsenedMetrics(): MetricsSnapshot {
  return baseMetrics({
    classification_completeness: 0.5,
    average_coverage: 0.4,
    violation_density: 200,
    pending_count: 50,
    average_surface_variance: 0.5,
  });
}

/**
 * Convenience: a starting-from-better metrics snapshot used as the
 * "prior" for high-drift tests. Pair with `worsenedMetrics()` for the
 * current snapshot to produce drift ≈ 1.0.
 */
export function priorBetterMetrics(): MetricsSnapshot {
  return baseMetrics({
    classification_completeness: 0.9,
    average_coverage: 0.8,
    violation_density: 50,
    pending_count: 5,
    median_disposition_latency_ms: 30000,
  });
}
