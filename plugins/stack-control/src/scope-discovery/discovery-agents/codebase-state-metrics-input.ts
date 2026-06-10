/**
 * plugins/stack-control/src/scope-discovery/discovery-agents/codebase-state-metrics-input.ts
 *
 * Input contract for the pure codebase-state-metrics computation.
 *
 * Extracted from codebase-state-metrics.ts (010 T034 — 500-line cap
 * split, R4). These interfaces describe the shape the synthesis pass
 * projects each registry / pattern-finding / git-log slice into before
 * handing it to `computeCodebaseStateMetrics()`. Splitting the input
 * contract out keeps the computation host file under the 500-line cap.
 *
 * No logic lives here — pure type declarations. The computation
 * (codebase-state-metrics.ts) and the late-metrics helpers
 * (codebase-state-metrics-late.ts) import `ComputeInput` and its member
 * types from this module; the host file re-exports them so existing
 * consumers (codebase-state-metrics-gather.ts, synthesis.ts) keep their
 * import paths unchanged.
 */

import type { BlessedPatternCatalog } from './codebase-state-metrics-types.js';
import type { CatalogStatus, Provenance } from '../util/catalog-status.js';

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
