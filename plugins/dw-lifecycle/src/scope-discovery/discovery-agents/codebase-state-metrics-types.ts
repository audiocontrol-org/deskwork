/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/codebase-state-metrics-types.ts
 *
 * Codebase-state metrics type definitions.
 *
 * Seven metrics that observe properties of the codebase + the catalog
 * regime over time. Their derivatives feed the self-correcting controller's self-
 * correcting controller — but at THIS layer the metrics are purely
 * INFORMATIONAL. They land in the scope-manifest's `codebase_state_metrics:`
 * section so:
 *
 *   - operators see what the regime knows about itself at any point;
 *   - downstream consumers (Task 5 controller, dashboards) read a
 *     stable wire-format shape;
 *   - regressions in classification completeness / disposition latency /
 *     etc. become visible without bespoke instrumentation.
 *
 * # The seven metrics
 *
 *   1. classification_completeness — fraction of distinct shapes in the
 *      codebase that are catalogued (status: blessed/cursed/ignore/
 *      tracked-holdout). Denominator includes discovered candidates
 *      (status: pending) + uncatalogued candidates from the clustering
 *      pass (stub; currently a stub).
 *
 *   2. coverage_per_blessed_pattern — for each blessed entry with a
 *      `match_glob` (negative-space / coverage handlers), the adoption
 *      ratio numerator/denominator + per-entry raw counts.
 *
 *   3. violation_density_per_cursed_pattern — for each cursed entry,
 *      hit counts clustered by directory + a Gini-style concentration
 *      score (0.0 = perfectly scattered; 1.0 = perfectly concentrated).
 *
 *   4. surface_uniformity — per-directory variance in shape across
 *      sibling files. Reads from the outlier-handler findings when
 *      present; otherwise computes a simple token-composition variance.
 *
 *   5. catalog_stability — edit rate over time. Reads the most-recent
 *      N commits touching catalog files (default N=20); reports
 *      edits-per-commit average + trend direction.
 *
 *   6. discovered_candidate_rate — count of `status: pending` entries
 *      created per scan-run. Uses `provenance.context` (scan-run-id)
 *      when available; falls back to `authored_at` bucketing.
 *
 *   7. disposition_latency — for entries that transitioned out of
 *      `pending`, time between `authored_at` and the transition
 *      (median, p90, per-entry list for the slowest 5).
 *
 * # Reading these on the manifest
 *
 * All seven sub-sections are OPTIONAL at the manifest level: a manifest
 * generated before codebase-state metrics lands continues to parse. The
 * synthesis pass emits the section ONLY when at least one metric was
 * computed (catalogs present + scan run executed); otherwise the
 * section is omitted entirely.
 */

/**
 * Metric 1: Classification completeness.
 *
 * `catalogued_distinct_shapes` — count of distinct catalog entry ids
 * across every catalog (anti-patterns, adopter-manifests, pattern-matrix,
 * clones) whose status is one of blessed / cursed / ignore /
 * tracked-holdout. Pending entries don't count toward "catalogued" —
 * they're awaiting triage.
 *
 * `total_distinct_shapes` — `catalogued_distinct_shapes` + pending
 * entries + uncatalogued candidates from G5 clustering.
 *
 * `ratio` — `catalogued_distinct_shapes / total_distinct_shapes`. When
 * the denominator is 0 (empty regime), ratio = 1.0 (vacuously complete);
 * `total_distinct_shapes` = 0 is the operator's signal that nothing is
 * known yet.
 */
export interface ClassificationCompletenessMetric {
  readonly catalogued_distinct_shapes: number;
  readonly pending_distinct_shapes: number;
  readonly uncatalogued_candidates: number;
  readonly total_distinct_shapes: number;
  readonly ratio: number;
}

/**
 * One per-blessed-pattern coverage entry.
 *
 *   - `entry_id` — the catalog entry id (kebab-case).
 *   - `catalog` — which registry the entry came from
 *     (`'anti-patterns'` / `'adopter-manifests'` / `'pattern-matrix'` /
 *     `'clones'`). Lets the operator resolve back to the source on read.
 *   - `match_glob` — the glob the entry matches against (for
 *     negative-space / coverage handler entries; for adopter-manifests,
 *     a flattened representation joining `expected_adopters_glob`).
 *   - `files_matching_glob` — denominator (total files in glob).
 *   - `files_with_primitive` — numerator (files containing the canonical
 *     primitive).
 *   - `ratio` — numerator / denominator, 0.0–1.0. Vacuously 1.0 when
 *     the denominator is 0 (the glob matches nothing).
 */
export interface CoveragePerBlessedPattern {
  readonly entry_id: string;
  readonly catalog: BlessedPatternCatalog;
  readonly match_glob: string;
  readonly files_matching_glob: number;
  readonly files_with_primitive: number;
  readonly ratio: number;
}

export type BlessedPatternCatalog =
  | 'anti-patterns'
  | 'adopter-manifests'
  | 'pattern-matrix'
  | 'clones';

/**
 * One per-cursed-pattern violation-density entry.
 *
 *   - `entry_id` — the catalog entry id.
 *   - `catalog` — source registry, as above.
 *   - `total_hits` — total hits for this entry across the codebase.
 *   - `per_directory_hits` — sorted descending by hit count; one entry
 *     per directory with at least one hit.
 *   - `concentration` — Gini-coefficient-style concentration score on
 *     [0.0, 1.0]: 0.0 = perfectly distributed (e.g., 1 hit in each of
 *     20 directories); 1.0 = perfectly concentrated (all hits in one
 *     directory). Computed only when `total_hits >= 2`; otherwise null.
 */
export interface ViolationDensityPerCursedPattern {
  readonly entry_id: string;
  readonly catalog: BlessedPatternCatalog;
  readonly total_hits: number;
  readonly per_directory_hits: ReadonlyArray<PerDirectoryHitCount>;
  readonly concentration: number | null;
}

export interface PerDirectoryHitCount {
  readonly directory: string;
  readonly hit_count: number;
}

/**
 * Metric 4: Surface uniformity / outlier presence per directory.
 *
 * `outlier_count` — files marked as outliers (z > thresholdSigma from
 * the per-directory centroid). Sourced from the outlier-handler
 * findings when present.
 *
 * `variance` — average per-file deviation from the centroid (0.0
 * = perfectly uniform, larger = more variance). When the outlier
 * handler has not run, this is computed from a simple token-composition
 * variance across the directory's files.
 */
export interface SurfaceUniformityEntry {
  readonly directory: string;
  readonly population: number;
  readonly outlier_count: number;
  readonly variance: number;
}

/**
 * Metric 5: Catalog stability — edit rate over time.
 *
 *   - `lookback_commits` — how many commits the metric considered
 *     (default 20).
 *   - `commits_with_edits` — count of those commits that touched at
 *     least one catalog file.
 *   - `total_catalog_edits` — sum of (per-commit catalog-file-changes)
 *     across the window.
 *   - `edits_per_commit_avg` — mean edits per commit in the window
 *     (calculated as `total_catalog_edits / lookback_commits`).
 *   - `trend` — direction of the edit rate. We split the window in
 *     half, average each half's edit count, then compare:
 *       - `increasing` if second-half avg > first-half avg by > 10%.
 *       - `decreasing` if second-half avg < first-half avg by > 10%.
 *       - `stable` otherwise (incl. when both halves are 0).
 *
 * `git_available` — `false` when git history could not be read (no
 * git binary, not a git repo, or the synthesis pass was invoked with
 * `--no-git-history`). Every numeric field is 0 in that case; the
 * operator sees the false flag and knows the metric is unavailable
 * vs. legitimately zero.
 */
export interface CatalogStabilityMetric {
  readonly git_available: boolean;
  readonly lookback_commits: number;
  readonly commits_with_edits: number;
  readonly total_catalog_edits: number;
  readonly edits_per_commit_avg: number;
  readonly trend: 'increasing' | 'decreasing' | 'stable';
}

/**
 * Metric 6: Discovered-candidate rate.
 *
 *   - `pending_entries_total` — count of `status: pending` entries
 *     across every catalog.
 *   - `by_scan_run` — bucketing by `provenance.context` (when the
 *     context starts with `scan-run-id-`); each entry is
 *     `{ scan_run_id, pending_count }`.
 *   - `unattributed_pending` — pending entries lacking a scan-run-id
 *     context (e.g., synthesized install-seed provenance, or
 *     operator-authored pending entries). Surfaced as a separate
 *     bucket so the rate isn't inflated by entries we can't attribute.
 *   - `trend` — `'increasing'` / `'decreasing'` / `'stable'` based on
 *     comparing the most-recent scan-run's pending count vs the
 *     average of the prior runs. Requires >= 2 scan-runs to compute;
 *     otherwise `null`.
 */
export interface DiscoveredCandidateRateMetric {
  readonly pending_entries_total: number;
  readonly unattributed_pending: number;
  readonly by_scan_run: ReadonlyArray<ScanRunPendingCount>;
  readonly trend: 'increasing' | 'decreasing' | 'stable' | null;
}

export interface ScanRunPendingCount {
  readonly scan_run_id: string;
  readonly pending_count: number;
}

/**
 * Metric 7: Disposition latency.
 *
 *   - `transitioned_count` — total entries observed in the catalog
 *     transitions log (used as the population for median / p90).
 *     codebase-state metrics currently reads the log from a single source: a
 *     `transitioned_at` field synthesizable from registered scan-run
 *     evidence trails. When the log isn't available, the metric
 *     reports 0 transitions + null statistics.
 *   - `median_latency_ms` — median latency (ms) from `authored_at` to
 *     `transitioned_at`. `null` when the population is empty.
 *   - `p90_latency_ms` — 90th percentile latency. `null` when the
 *     population is < 10 (statistics are unreliable on small N).
 *   - `slowest_five` — the five entries with the largest latency, in
 *     descending order. Empty array when no transitions.
 */
export interface DispositionLatencyMetric {
  readonly transitioned_count: number;
  readonly median_latency_ms: number | null;
  readonly p90_latency_ms: number | null;
  readonly slowest_five: ReadonlyArray<DispositionLatencyEntry>;
}

export interface DispositionLatencyEntry {
  readonly entry_id: string;
  readonly catalog: BlessedPatternCatalog;
  readonly authored_at: string;
  readonly transitioned_at: string;
  readonly latency_ms: number;
}

/**
 * The composite metrics block emitted into the scope-manifest under
 * `codebase_state_metrics:`. Every sub-metric is REQUIRED on this type
 * (the computation always produces all seven); the manifest-level
 * field is OPTIONAL (legacy manifests omit it).
 *
 * `generated_at` is an ISO-8601 timestamp set by the computation; it's
 * separate from the manifest's own `generated_at` so a downstream
 * consumer can tell when these metrics specifically were computed (the
 * the self-correcting controller controller will dispatch them on a different cadence
 * from manifest emission once the controller lands).
 */
export interface CodebaseStateMetrics {
  readonly generated_at: string;
  readonly classification_completeness: ClassificationCompletenessMetric;
  readonly coverage_per_blessed_pattern: ReadonlyArray<CoveragePerBlessedPattern>;
  readonly violation_density_per_cursed_pattern: ReadonlyArray<ViolationDensityPerCursedPattern>;
  readonly surface_uniformity: ReadonlyArray<SurfaceUniformityEntry>;
  readonly catalog_stability: CatalogStabilityMetric;
  readonly discovered_candidate_rate: DiscoveredCandidateRateMetric;
  readonly disposition_latency: DispositionLatencyMetric;
}
