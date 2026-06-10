/**
 * plugins/stack-control/src/scope-discovery/discovery-agents/codebase-state-metrics-late.ts
 *
 * Late metrics (6 + 7) for the codebase-state-metrics computation:
 * discovered-candidate rate and disposition latency.
 *
 * Extracted from codebase-state-metrics.ts (010 T034 — 500-line cap
 * split, R4). These two metrics are self-contained — they read only
 * `ComputeInput` and emit their respective metric shapes. The host
 * file's `computeCodebaseStateMetrics()` calls
 * `computeDiscoveredCandidateRate()` + `computeDispositionLatency()`
 * from here. Their threshold constants travel with them so the host
 * stays under the cap.
 */

import type {
  DiscoveredCandidateRateMetric,
  DispositionLatencyEntry,
  DispositionLatencyMetric,
  ScanRunPendingCount,
} from './codebase-state-metrics-types.js';
import type { ComputeInput } from './codebase-state-metrics-input.js';

/**
 * Disposition-latency p90 minimum population. With N < 10 the p90 is
 * dominated by one or two outliers; reporting it would mislead the
 * controller. Median still reports at any N >= 1.
 */
export const LATENCY_P90_MIN_POPULATION = 10;

/** How many "slowest" entries to surface for operator inspection. */
export const LATENCY_SLOWEST_COUNT = 5;

/** Discovered-candidate rate trend threshold (mirrors stability's 10%). */
export const CANDIDATE_RATE_TREND_THRESHOLD = 0.1;

// ---------------------------------------------------------------------------
// Metric 6: Discovered-candidate rate
// ---------------------------------------------------------------------------

const SCAN_RUN_CONTEXT_PREFIX = 'scan-run-id-';

export function computeDiscoveredCandidateRate(
  input: ComputeInput,
): DiscoveredCandidateRateMetric {
  // Tally pending entries from the entry list, bucketed by
  // provenance.context.
  let pendingTotal = 0;
  let unattributed = 0;
  const perScanRun = new Map<string, number>();
  for (const entry of input.entries) {
    if (entry.status !== 'pending') continue;
    pendingTotal += 1;
    const ctx = entry.provenance.context;
    if (ctx !== undefined && ctx.startsWith(SCAN_RUN_CONTEXT_PREFIX)) {
      const id = ctx.slice(SCAN_RUN_CONTEXT_PREFIX.length);
      perScanRun.set(id, (perScanRun.get(id) ?? 0) + 1);
    } else {
      unattributed += 1;
    }
  }
  // Merge with explicit scan-run observations (the synthesis pass may
  // know about scan runs even when no pending entries were authored in
  // them — e.g., a run that triaged but did not propose).
  for (const run of input.scanRuns) {
    if (!perScanRun.has(run.scan_run_id)) {
      perScanRun.set(run.scan_run_id, run.pending_entries_created);
    }
  }
  // Build sorted output (deterministic).
  const byScanRun: ScanRunPendingCount[] = [];
  for (const [scanRunId, count] of perScanRun.entries()) {
    byScanRun.push({ scan_run_id: scanRunId, pending_count: count });
  }
  byScanRun.sort((a, b) =>
    a.scan_run_id < b.scan_run_id ? -1 : a.scan_run_id > b.scan_run_id ? 1 : 0,
  );
  // Trend: requires >= 2 scan-runs with run_at timestamps from the
  // observations. Order by run_at; compare last vs average-of-prior.
  let trend: 'increasing' | 'decreasing' | 'stable' | null = null;
  if (input.scanRuns.length >= 2) {
    const ordered = [...input.scanRuns].sort((a, b) =>
      a.run_at < b.run_at ? -1 : a.run_at > b.run_at ? 1 : 0,
    );
    const last = ordered[ordered.length - 1];
    if (last !== undefined) {
      const prior = ordered.slice(0, -1);
      const priorAvg =
        prior.reduce((s, r) => s + r.pending_entries_created, 0) / prior.length;
      if (priorAvg === 0 && last.pending_entries_created === 0) {
        trend = 'stable';
      } else if (priorAvg === 0) {
        trend = last.pending_entries_created > 0 ? 'increasing' : 'stable';
      } else {
        const delta = (last.pending_entries_created - priorAvg) / priorAvg;
        if (delta > CANDIDATE_RATE_TREND_THRESHOLD) trend = 'increasing';
        else if (delta < -CANDIDATE_RATE_TREND_THRESHOLD) trend = 'decreasing';
        else trend = 'stable';
      }
    }
  }
  return {
    pending_entries_total: pendingTotal,
    unattributed_pending: unattributed,
    by_scan_run: byScanRun,
    trend,
  };
}

// ---------------------------------------------------------------------------
// Metric 7: Disposition latency
// ---------------------------------------------------------------------------

function percentile(sortedAsc: ReadonlyArray<number>, p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.floor((sortedAsc.length - 1) * p);
  return sortedAsc[idx] ?? null;
}

function median(sortedAsc: ReadonlyArray<number>): number | null {
  if (sortedAsc.length === 0) return null;
  const n = sortedAsc.length;
  if (n % 2 === 1) {
    return sortedAsc[Math.floor(n / 2)] ?? null;
  }
  const lo = sortedAsc[n / 2 - 1];
  const hi = sortedAsc[n / 2];
  if (lo === undefined || hi === undefined) return null;
  return (lo + hi) / 2;
}

export function computeDispositionLatency(
  input: ComputeInput,
): DispositionLatencyMetric {
  // For each transition, compute latency_ms = transitioned_at - authored_at.
  const transitions: DispositionLatencyEntry[] = [];
  for (const t of input.transitions) {
    const authored = Date.parse(t.authored_at);
    const transitioned = Date.parse(t.transitioned_at);
    // Tolerate unparseable timestamps by skipping — better to omit one
    // transition than to inject NaN-poison into the percentile math.
    if (Number.isNaN(authored) || Number.isNaN(transitioned)) continue;
    if (transitioned < authored) continue; // negative latency = clock skew, skip
    transitions.push({
      entry_id: t.entry_id,
      catalog: t.catalog,
      authored_at: t.authored_at,
      transitioned_at: t.transitioned_at,
      latency_ms: transitioned - authored,
    });
  }
  const sortedLatencies = transitions.map((t) => t.latency_ms).sort((a, b) => a - b);
  const medianMs = median(sortedLatencies);
  const p90Ms =
    sortedLatencies.length >= LATENCY_P90_MIN_POPULATION
      ? percentile(sortedLatencies, 0.9)
      : null;
  const slowest = [...transitions]
    .sort((a, b) => b.latency_ms - a.latency_ms)
    .slice(0, LATENCY_SLOWEST_COUNT);
  return {
    transitioned_count: transitions.length,
    median_latency_ms: medianMs,
    p90_latency_ms: p90Ms,
    slowest_five: slowest,
  };
}
