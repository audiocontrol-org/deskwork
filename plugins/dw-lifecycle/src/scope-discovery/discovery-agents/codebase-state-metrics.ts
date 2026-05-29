/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/codebase-state-metrics.ts
 *
 * Codebase-state metrics computation library.
 *
 * Pure computation: takes parsed catalogs + pattern findings + git
 * history + scan-run history, returns the seven metrics. No I/O — the
 * synthesis pass gathers inputs (file reads, git log calls, scan-run
 * directory walks) and passes them in.
 *
 * Why a pure computation: tests can plant synthetic inputs without
 * walking the filesystem; the controller (the self-correcting controller) can re-run
 * metrics on a delta without re-touching disk; the LLM judge (Task 7)
 * gets a deterministic snapshot of what the regime knows about itself.
 *
 * # Algorithmic choices + rationale
 *
 *   1. Classification completeness: cataloged := distinct entry ids
 *      with status in {blessed, cursed, ignore, tracked-holdout}. Pending
 *      entries don't count toward "catalogued"; G5 discovered candidates
 *      (currently a stub) inflate the denominator. The denominator-
 *      including-G5 choice is forward-compatible: once G5 produces real
 *      clusters, the metric naturally reflects "we know we don't have
 *      vocabulary for these."
 *
 *   2. Coverage per blessed pattern: only entries with a `match_glob` /
 *      `expected_adopters_glob` contribute. Anti-patterns (which lack
 *      a glob — they're regex-only) don't produce coverage rows.
 *
 *   3. Violation density: Gini-style concentration. With H total hits
 *      distributed across D directories with counts c_1..c_d, the
 *      concentration is:
 *
 *        sum(|c_i - c_j|) / (2 * D * H)
 *
 *      bounded [0, 1]. All-concentrated (one dir has H, rest zero) → 1.
 *      Perfectly-spread (each dir has H/D) → 0. Computed only when
 *      total_hits >= 2 (otherwise meaningless).
 *
 *   4. Surface uniformity: read outlier-handler findings when present
 *      (they already carry per-directory variance via the `outliers`
 *      metric); fall back to a token-composition variance computed
 *      from the same scan inputs the outlier handler uses. Per-
 *      directory bucketing matches the outlier handler's algorithm so
 *      the two metrics are consistent.
 *
 *   5. Catalog stability: trend is a 50/50 split on the lookback
 *      window with a 10% threshold (avoids "everything is trending"
 *      noise on small windows). When the lookback window is < 4
 *      commits, trend is always 'stable' (insufficient data).
 *
 *   6. Discovered-candidate rate: trend compares the most-recent
 *      scan-run's pending count vs the average of prior runs.
 *      Requires >= 2 scan-runs to compute; otherwise null. The
 *      `unattributed_pending` bucket carries pending entries whose
 *      provenance.context isn't a scan-run-id (so the rate isn't
 *      inflated by entries we can't time-bucket).
 *
 *   7. Disposition latency: median + p90 + slowest-five. p90 is null
 *      when N < 10 (statistics on small N are unreliable).
 *
 * # Default thresholds (with rationale)
 */

import type {
  BlessedPatternCatalog,
  CatalogStabilityMetric,
  ClassificationCompletenessMetric,
  CodebaseStateMetrics,
  CoveragePerBlessedPattern,
  DiscoveredCandidateRateMetric,
  DispositionLatencyEntry,
  DispositionLatencyMetric,
  PerDirectoryHitCount,
  ScanRunPendingCount,
  SurfaceUniformityEntry,
  ViolationDensityPerCursedPattern,
} from './codebase-state-metrics-types.js';
import type {
  CatalogStatus,
  Provenance,
} from '../util/catalog-status.js';

// Default thresholds — exported so tests + downstream consumers can
// reference them by name rather than literal magic numbers.

/**
 * Catalog-stability default lookback window. 20 commits balances
 * "enough commits to detect a trend" with "recent enough that the
 * trend is current." Smaller windows produce noisy trends; larger
 * windows amortize away short-term reactions to operator interventions.
 * Tunable via the synthesis input.
 */
export const DEFAULT_CATALOG_STABILITY_LOOKBACK = 20;

/**
 * Catalog-stability trend threshold. The 50/50-split halves must
 * differ by more than 10% (in either direction) for the trend to read
 * as `increasing` / `decreasing`. Below the threshold the trend is
 * `stable` — protects against false-alarm "every metric is moving"
 * commentary on noise.
 */
export const CATALOG_STABILITY_TREND_THRESHOLD = 0.1;

/**
 * Minimum lookback window for trend computation. With < 4 commits the
 * 50/50 split produces 2-commit halves whose average is dominated by
 * any single commit's catalog edits — too noisy to call.
 */
export const CATALOG_STABILITY_MIN_LOOKBACK_FOR_TREND = 4;

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
// Input contract
// ---------------------------------------------------------------------------

/**
 * One catalog entry condensed to the shape the computation needs. The
 * synthesis pass projects each registry's per-entry type into this
 * shape so the computation doesn't need to learn each registry's wire
 * format.
 */
export interface CatalogEntrySnapshot {
  readonly entry_id: string;
  readonly catalog: BlessedPatternCatalog;
  readonly status: CatalogStatus;
  readonly provenance: Provenance;
  /**
   * Optional match_glob for coverage / negative-space entries from
   * pattern-matrix, and the canonical glob for adopter-manifests
   * entries (the first `expected_adopters_glob`). Anti-patterns and
   * clones don't carry one (anti-patterns are regex-only; clones
   * carry member-file lists, not globs).
   */
  readonly match_glob?: string;
}

/**
 * Per-entry observed hit count + per-file membership. The synthesis
 * pass derives this from the pattern-matrix findings, the
 * adopter-manifest-checker findings, the anti-pattern scanner, and the
 * clone-detector reader.
 *
 *   - `files_with_primitive` (used by coverage metric) — count of
 *     files in `match_glob` that contain the canonical primitive.
 *     Numerator. Pulled from the negative-space handler's metrics
 *     (`metrics.glob_matched_files - metrics.holdouts`) or the
 *     coverage handler's metrics (`metrics.numerator`).
 *   - `files_matching_glob` — denominator.
 *   - `hits_by_file` (used by violation density) — per-file hit
 *     counts. Anti-pattern-style findings produce this; coverage-style
 *     entries don't (their semantic is presence, not count).
 */
export interface CatalogEntryObservation {
  readonly entry_id: string;
  readonly catalog: BlessedPatternCatalog;
  readonly files_matching_glob?: number;
  readonly files_with_primitive?: number;
  /** Per-file hit counts. Used to compute violation density. */
  readonly hits_by_file?: ReadonlyMap<string, number>;
}

/**
 * One outlier-handler finding boiled down to what the metric needs.
 * Sourced from the pattern-matrix agent's outlier handler output.
 * Optional — when the outlier handler hasn't run, the surface-uniformity
 * metric falls back to a token-variance computation against `scans`.
 */
export interface OutlierObservation {
  readonly entry_id: string;
  /** Map of directory → outlier file count. */
  readonly outliers_by_directory: ReadonlyMap<string, number>;
  /** Map of directory → population (total files scored in dir). */
  readonly population_by_directory: ReadonlyMap<string, number>;
  /** Map of directory → mean cosine distance from centroid. */
  readonly mean_distance_by_directory: ReadonlyMap<string, number>;
}

/**
 * One commit's relevant edits in the catalog-stability window.
 * Synthesis pass produces these by reading `git log --name-only -N --
 * <catalog-files>`; this type is the in-memory shape the metric
 * consumes.
 */
export interface CommitEdit {
  /** Commit SHA — informational; not used by computation. */
  readonly sha: string;
  /** Number of catalog files this commit touched. */
  readonly catalog_files_changed: number;
}

/**
 * One scan-run's pending-count observation. Synthesis derives these
 * from the run-id provenance.context buckets across the catalogs:
 * each scan run leaves entries with `provenance.context: scan-run-id-<id>`
 * which the metric tallies.
 */
export interface ScanRunObservation {
  readonly scan_run_id: string;
  readonly pending_entries_created: number;
  /** ISO-8601 of the scan run (used only for ordering; sortable as string). */
  readonly run_at: string;
}

/**
 * One disposition-transition observation. Synthesis derives these by
 * comparing scan-run sequences: when an entry's status was `pending`
 * in run R-1 and becomes something else in run R, the latency is
 * `(R.run_at - authored_at)`.
 */
export interface DispositionTransitionObservation {
  readonly entry_id: string;
  readonly catalog: BlessedPatternCatalog;
  readonly authored_at: string;
  readonly transitioned_at: string;
}

/**
 * The complete input contract for the pure computation.
 */
export interface ComputeInput {
  /** Every catalog entry across every registry. */
  readonly entries: ReadonlyArray<CatalogEntrySnapshot>;
  /** Per-entry observations: hit counts + file membership. */
  readonly observations: ReadonlyArray<CatalogEntryObservation>;
  /**
   * Outlier-handler observations. When empty, surface-uniformity
   * is sourced from `directorySamples` instead.
   */
  readonly outliers: ReadonlyArray<OutlierObservation>;
  /**
   * Per-directory population + variance data for the fallback
   * surface-uniformity path. The synthesis pass derives this from
   * the pattern-matrix scan inputs the outlier handler would
   * normally consume.
   */
  readonly directorySamples: ReadonlyArray<DirectorySampleStats>;
  /** Count of uncatalogued candidates from the G5 clustering pass (stubbed → 0). */
  readonly uncataloguedCandidateCount: number;
  /** Catalog-stability commit log slice; empty when git unavailable. */
  readonly commitEdits: ReadonlyArray<CommitEdit>;
  /** True iff the commitEdits slice was sourced from a real git invocation. */
  readonly gitAvailable: boolean;
  /** Lookback window the commit-edit slice represents. */
  readonly lookbackCommits: number;
  /** Scan-run observations for the discovered-candidate-rate metric. */
  readonly scanRuns: ReadonlyArray<ScanRunObservation>;
  /** Disposition-transition observations for the latency metric. */
  readonly transitions: ReadonlyArray<DispositionTransitionObservation>;
  /** Timestamp the metrics were generated at. */
  readonly generatedAt: string;
}

/**
 * One directory's per-file token-composition snapshot for the
 * surface-uniformity fallback path.
 */
export interface DirectorySampleStats {
  readonly directory: string;
  readonly population: number;
  /** Mean cosine distance from the centroid; 0 means perfectly uniform. */
  readonly mean_distance: number;
  /** Outliers (per the simple z>2 rule). */
  readonly outlier_count: number;
}

// ---------------------------------------------------------------------------
// Metric 1: Classification completeness
// ---------------------------------------------------------------------------

const CATALOGUED_STATUSES: ReadonlySet<CatalogStatus> = new Set<CatalogStatus>([
  'blessed',
  'cursed',
  'ignore',
  'tracked-holdout',
]);

function computeClassificationCompleteness(
  input: ComputeInput,
): ClassificationCompletenessMetric {
  const distinctById = new Map<string, CatalogStatus>();
  for (const entry of input.entries) {
    const key = `${entry.catalog}:${entry.entry_id}`;
    // First-write-wins — if the same entry appears multiple times (e.g.
    // across snapshots), the first status wins. This is consistent with
    // the synthesis pass which feeds one snapshot per entry.
    if (!distinctById.has(key)) {
      distinctById.set(key, entry.status);
    }
  }
  let catalogued = 0;
  let pending = 0;
  for (const status of distinctById.values()) {
    if (CATALOGUED_STATUSES.has(status)) {
      catalogued += 1;
    } else if (status === 'pending') {
      pending += 1;
    }
    // 'withdrawn' entries are historical — not counted as either
    // catalogued OR pending (they represent regime decisions that were
    // overturned). They don't inflate the denominator.
  }
  const total = catalogued + pending + input.uncataloguedCandidateCount;
  const ratio = total === 0 ? 1.0 : catalogued / total;
  return {
    catalogued_distinct_shapes: catalogued,
    pending_distinct_shapes: pending,
    uncatalogued_candidates: input.uncataloguedCandidateCount,
    total_distinct_shapes: total,
    ratio,
  };
}

// ---------------------------------------------------------------------------
// Metric 2: Coverage per blessed pattern
// ---------------------------------------------------------------------------

function computeCoveragePerBlessedPattern(
  input: ComputeInput,
): ReadonlyArray<CoveragePerBlessedPattern> {
  const observationsById = new Map<string, CatalogEntryObservation>();
  for (const obs of input.observations) {
    observationsById.set(`${obs.catalog}:${obs.entry_id}`, obs);
  }
  const out: CoveragePerBlessedPattern[] = [];
  for (const entry of input.entries) {
    if (entry.status !== 'blessed') continue;
    if (entry.match_glob === undefined) continue;
    const obs = observationsById.get(`${entry.catalog}:${entry.entry_id}`);
    if (obs === undefined) continue;
    if (obs.files_matching_glob === undefined) continue;
    if (obs.files_with_primitive === undefined) continue;
    const denominator = obs.files_matching_glob;
    const numerator = obs.files_with_primitive;
    const ratio = denominator === 0 ? 1.0 : numerator / denominator;
    out.push({
      entry_id: entry.entry_id,
      catalog: entry.catalog,
      match_glob: entry.match_glob,
      files_matching_glob: denominator,
      files_with_primitive: numerator,
      ratio,
    });
  }
  // Deterministic ordering: by catalog then by entry_id so the manifest
  // diff is stable across runs.
  out.sort(byCatalogThenId);
  return out;
}

function byCatalogThenId(
  a: { catalog: string; entry_id: string },
  b: { catalog: string; entry_id: string },
): number {
  if (a.catalog !== b.catalog) return a.catalog < b.catalog ? -1 : 1;
  if (a.entry_id !== b.entry_id) return a.entry_id < b.entry_id ? -1 : 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Metric 3: Violation density per cursed pattern
// ---------------------------------------------------------------------------

function dirOf(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx < 0 ? '.' : filePath.slice(0, idx);
}

/**
 * Gini-style concentration on a list of per-directory counts. Returns
 * 0.0 for perfectly-spread distributions and 1.0 for perfectly-
 * concentrated (one directory has every hit). Returns null when the
 * input is too small (< 2 hits) to be meaningful.
 *
 * Formula: G = sum(|c_i - c_j|) / (2 * D * H)
 *   where D = directories with hits, H = sum of counts.
 * This is the standard Gini-coefficient form adapted to integer hit
 * counts.
 */
export function computeGiniConcentration(
  counts: ReadonlyArray<number>,
): number | null {
  const total = counts.reduce((s, c) => s + c, 0);
  if (total < 2) return null;
  const d = counts.length;
  if (d === 0) return null;
  // Special case: one directory holds all hits → perfect concentration.
  if (d === 1) return 1.0;
  let absDifferences = 0;
  for (let i = 0; i < d; i += 1) {
    for (let j = 0; j < d; j += 1) {
      const ci = counts[i] ?? 0;
      const cj = counts[j] ?? 0;
      absDifferences += Math.abs(ci - cj);
    }
  }
  return absDifferences / (2 * d * total);
}

function computeViolationDensityPerCursedPattern(
  input: ComputeInput,
): ReadonlyArray<ViolationDensityPerCursedPattern> {
  const observationsById = new Map<string, CatalogEntryObservation>();
  for (const obs of input.observations) {
    observationsById.set(`${obs.catalog}:${obs.entry_id}`, obs);
  }
  const out: ViolationDensityPerCursedPattern[] = [];
  for (const entry of input.entries) {
    if (entry.status !== 'cursed') continue;
    const obs = observationsById.get(`${entry.catalog}:${entry.entry_id}`);
    if (obs === undefined) continue;
    if (obs.hits_by_file === undefined) continue;
    const byDir = new Map<string, number>();
    let totalHits = 0;
    for (const [file, count] of obs.hits_by_file.entries()) {
      const dir = dirOf(file);
      byDir.set(dir, (byDir.get(dir) ?? 0) + count);
      totalHits += count;
    }
    const perDirSorted: PerDirectoryHitCount[] = [];
    for (const [directory, hitCount] of byDir.entries()) {
      perDirSorted.push({ directory, hit_count: hitCount });
    }
    perDirSorted.sort((a, b) => {
      if (a.hit_count !== b.hit_count) return b.hit_count - a.hit_count;
      return a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0;
    });
    const concentration = computeGiniConcentration(perDirSorted.map((d) => d.hit_count));
    out.push({
      entry_id: entry.entry_id,
      catalog: entry.catalog,
      total_hits: totalHits,
      per_directory_hits: perDirSorted,
      concentration,
    });
  }
  out.sort(byCatalogThenId);
  return out;
}

// ---------------------------------------------------------------------------
// Metric 4: Surface uniformity / outlier presence per directory
// ---------------------------------------------------------------------------

function computeSurfaceUniformity(
  input: ComputeInput,
): ReadonlyArray<SurfaceUniformityEntry> {
  // Prefer outlier-handler findings when present — they're the
  // authoritative per-directory analysis from the same handler the
  // operator configured.
  const out: SurfaceUniformityEntry[] = [];
  if (input.outliers.length > 0) {
    // Union of directories across all outlier observations. Use both
    // outliers_by_directory + population_by_directory keys so we surface
    // even directories where only outlier-count is known (the gatherer
    // emits this shape when the outlier handler doesn't carry per-dir
    // populations).
    const seenDirs = new Set<string>();
    for (const obs of input.outliers) {
      for (const dir of obs.outliers_by_directory.keys()) seenDirs.add(dir);
      for (const dir of obs.population_by_directory.keys()) seenDirs.add(dir);
    }
    for (const dir of seenDirs) {
      let outlierCount = 0;
      let variance = 0;
      let population = 0;
      let varianceObservations = 0;
      for (const obs of input.outliers) {
        outlierCount += obs.outliers_by_directory.get(dir) ?? 0;
        const pop = obs.population_by_directory.get(dir);
        if (pop !== undefined && population === 0) population = pop;
        const dist = obs.mean_distance_by_directory.get(dir);
        if (dist !== undefined) {
          variance += dist;
          varianceObservations += 1;
        }
      }
      out.push({
        directory: dir,
        population,
        outlier_count: outlierCount,
        variance: varianceObservations === 0 ? 0 : variance / varianceObservations,
      });
    }
  } else {
    for (const sample of input.directorySamples) {
      out.push({
        directory: sample.directory,
        population: sample.population,
        outlier_count: sample.outlier_count,
        variance: sample.mean_distance,
      });
    }
  }
  out.sort((a, b) => (a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------------------
// Metric 5: Catalog stability — edit rate over time
// ---------------------------------------------------------------------------

function computeCatalogStability(input: ComputeInput): CatalogStabilityMetric {
  if (!input.gitAvailable) {
    return {
      git_available: false,
      lookback_commits: 0,
      commits_with_edits: 0,
      total_catalog_edits: 0,
      edits_per_commit_avg: 0,
      trend: 'stable',
    };
  }
  const edits = input.commitEdits;
  const lookback = input.lookbackCommits;
  let totalEdits = 0;
  let commitsWithEdits = 0;
  for (const edit of edits) {
    totalEdits += edit.catalog_files_changed;
    if (edit.catalog_files_changed > 0) commitsWithEdits += 1;
  }
  const editsPerCommit = lookback === 0 ? 0 : totalEdits / lookback;
  // Trend computation: split the window in half. Commits are most-
  // recent-first by convention (git log default), so the FIRST half
  // is the RECENT half.
  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (edits.length >= CATALOG_STABILITY_MIN_LOOKBACK_FOR_TREND) {
    const half = Math.floor(edits.length / 2);
    const recentHalf = edits.slice(0, half);
    const olderHalf = edits.slice(half);
    const recentAvg = recentHalf.length === 0
      ? 0
      : recentHalf.reduce((s, e) => s + e.catalog_files_changed, 0) / recentHalf.length;
    const olderAvg = olderHalf.length === 0
      ? 0
      : olderHalf.reduce((s, e) => s + e.catalog_files_changed, 0) / olderHalf.length;
    if (olderAvg === 0 && recentAvg === 0) {
      trend = 'stable';
    } else if (olderAvg === 0) {
      // From zero to non-zero — increasing by definition.
      trend = recentAvg > 0 ? 'increasing' : 'stable';
    } else {
      const delta = (recentAvg - olderAvg) / olderAvg;
      if (delta > CATALOG_STABILITY_TREND_THRESHOLD) trend = 'increasing';
      else if (delta < -CATALOG_STABILITY_TREND_THRESHOLD) trend = 'decreasing';
    }
  }
  return {
    git_available: true,
    lookback_commits: lookback,
    commits_with_edits: commitsWithEdits,
    total_catalog_edits: totalEdits,
    edits_per_commit_avg: editsPerCommit,
    trend,
  };
}

// ---------------------------------------------------------------------------
// Metric 6: Discovered-candidate rate
// ---------------------------------------------------------------------------

const SCAN_RUN_CONTEXT_PREFIX = 'scan-run-id-';

function computeDiscoveredCandidateRate(
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

function computeDispositionLatency(
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

// ---------------------------------------------------------------------------
// Public computation entry point
// ---------------------------------------------------------------------------

/**
 * Pure computation. Takes the input contract, returns the seven
 * metrics. Throws on no input contract violations (consistent with the
 * project rule against fallbacks).
 */
export function computeCodebaseStateMetrics(
  input: ComputeInput,
): CodebaseStateMetrics {
  return {
    generated_at: input.generatedAt,
    classification_completeness: computeClassificationCompleteness(input),
    coverage_per_blessed_pattern: computeCoveragePerBlessedPattern(input),
    violation_density_per_cursed_pattern:
      computeViolationDensityPerCursedPattern(input),
    surface_uniformity: computeSurfaceUniformity(input),
    catalog_stability: computeCatalogStability(input),
    discovered_candidate_rate: computeDiscoveredCandidateRate(input),
    disposition_latency: computeDispositionLatency(input),
  };
}
