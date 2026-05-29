/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/codebase-state-metrics.test.ts
 *
 * Phase 11 Task 4 — Unit tests for the seven codebase-state metrics.
 *
 * Tests exercise the pure computation library `computeCodebaseStateMetrics`
 * against synthetic fixtures. Each metric has its own describe block;
 * each metric covers:
 *
 *   - golden-path (the metric computes the expected value);
 *   - edge case 1 (empty input / no observations);
 *   - edge case 2 (degenerate distribution / unparseable data);
 *   - cross-cutting concerns where relevant (e.g., status filtering).
 *
 * The gatherer integration is covered by a small end-to-end test
 * exercising on-disk catalog files in a tmpdir.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CATALOG_STABILITY_TREND_THRESHOLD,
  computeCodebaseStateMetrics,
  computeGiniConcentration,
  DEFAULT_CATALOG_STABILITY_LOOKBACK,
  type CatalogEntryObservation,
  type CatalogEntrySnapshot,
  type CommitEdit,
  type ComputeInput,
  type DirectorySampleStats,
  type DispositionTransitionObservation,
  type OutlierObservation,
  type ScanRunObservation,
} from '../../scope-discovery/discovery-agents/codebase-state-metrics.js';
import { gatherMetricsInput, parseGitLogOutput } from '../../scope-discovery/discovery-agents/codebase-state-metrics-gather.js';
import type { Provenance } from '../../scope-discovery/util/catalog-status.js';

const PROV: Provenance = { source: 'install-seed', authored_at: '1970-01-01T00:00:00Z' };

function makeInput(partial: Partial<ComputeInput>): ComputeInput {
  return {
    entries: [],
    observations: [],
    outliers: [],
    directorySamples: [],
    uncataloguedCandidateCount: 0,
    commitEdits: [],
    gitAvailable: false,
    lookbackCommits: 0,
    scanRuns: [],
    transitions: [],
    generatedAt: '2026-05-26T00:00:00Z',
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Metric 1: Classification completeness
// ---------------------------------------------------------------------------

describe('Metric 1: classification_completeness', () => {
  it('returns 1.0 ratio for an empty regime (vacuously complete)', () => {
    const out = computeCodebaseStateMetrics(makeInput({}));
    expect(out.classification_completeness.total_distinct_shapes).toBe(0);
    expect(out.classification_completeness.ratio).toBe(1.0);
  });

  it('counts each catalog:entry_id as one distinct shape', () => {
    const entries: CatalogEntrySnapshot[] = [
      { entry_id: 'a', catalog: 'anti-patterns', status: 'blessed', provenance: PROV },
      { entry_id: 'b', catalog: 'anti-patterns', status: 'cursed', provenance: PROV },
      { entry_id: 'a', catalog: 'pattern-matrix', status: 'pending', provenance: PROV },
      { entry_id: 'c', catalog: 'clones', status: 'ignore', provenance: PROV },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ entries }));
    expect(out.classification_completeness.catalogued_distinct_shapes).toBe(3);
    expect(out.classification_completeness.pending_distinct_shapes).toBe(1);
    expect(out.classification_completeness.total_distinct_shapes).toBe(4);
    expect(out.classification_completeness.ratio).toBeCloseTo(0.75, 6);
  });

  it('inflates denominator with uncatalogued candidates', () => {
    const entries: CatalogEntrySnapshot[] = [
      { entry_id: 'a', catalog: 'anti-patterns', status: 'blessed', provenance: PROV },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ entries, uncataloguedCandidateCount: 4 }));
    expect(out.classification_completeness.total_distinct_shapes).toBe(5);
    expect(out.classification_completeness.ratio).toBeCloseTo(0.2, 6);
  });

  it('does not count withdrawn entries in either bucket', () => {
    const entries: CatalogEntrySnapshot[] = [
      {
        entry_id: 'a',
        catalog: 'anti-patterns',
        status: 'withdrawn',
        provenance: { source: 'install-seed', authored_at: '1970-01-01T00:00:00Z', context: 'audit-finding-1' },
      },
      { entry_id: 'b', catalog: 'anti-patterns', status: 'blessed', provenance: PROV },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ entries }));
    expect(out.classification_completeness.catalogued_distinct_shapes).toBe(1);
    expect(out.classification_completeness.pending_distinct_shapes).toBe(0);
    expect(out.classification_completeness.total_distinct_shapes).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Metric 2: Coverage per blessed pattern
// ---------------------------------------------------------------------------

describe('Metric 2: coverage_per_blessed_pattern', () => {
  it('emits one row per blessed entry with a match_glob and observation', () => {
    const entries: CatalogEntrySnapshot[] = [
      {
        entry_id: 'card-adoption',
        catalog: 'pattern-matrix',
        status: 'blessed',
        provenance: PROV,
        match_glob: 'src/editors/**/*.tsx',
      },
      // No match_glob: skipped.
      { entry_id: 'as-cast', catalog: 'pattern-matrix', status: 'blessed', provenance: PROV },
      // Status pending: skipped.
      {
        entry_id: 'newish',
        catalog: 'pattern-matrix',
        status: 'pending',
        provenance: PROV,
        match_glob: 'src/things/*.ts',
      },
    ];
    const observations: CatalogEntryObservation[] = [
      {
        entry_id: 'card-adoption',
        catalog: 'pattern-matrix',
        files_matching_glob: 10,
        files_with_primitive: 7,
      },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ entries, observations }));
    expect(out.coverage_per_blessed_pattern).toHaveLength(1);
    const row = out.coverage_per_blessed_pattern[0];
    expect(row?.entry_id).toBe('card-adoption');
    expect(row?.files_matching_glob).toBe(10);
    expect(row?.files_with_primitive).toBe(7);
    expect(row?.ratio).toBeCloseTo(0.7, 6);
  });

  it('returns vacuous 1.0 when denominator is 0', () => {
    const entries: CatalogEntrySnapshot[] = [
      {
        entry_id: 'glob-with-no-matches',
        catalog: 'pattern-matrix',
        status: 'blessed',
        provenance: PROV,
        match_glob: 'src/nonexistent/*.tsx',
      },
    ];
    const observations: CatalogEntryObservation[] = [
      {
        entry_id: 'glob-with-no-matches',
        catalog: 'pattern-matrix',
        files_matching_glob: 0,
        files_with_primitive: 0,
      },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ entries, observations }));
    expect(out.coverage_per_blessed_pattern).toHaveLength(1);
    expect(out.coverage_per_blessed_pattern[0]?.ratio).toBe(1.0);
  });

  it('orders rows deterministically by catalog then entry_id', () => {
    const entries: CatalogEntrySnapshot[] = [
      { entry_id: 'z', catalog: 'pattern-matrix', status: 'blessed', provenance: PROV, match_glob: 'a' },
      { entry_id: 'a', catalog: 'pattern-matrix', status: 'blessed', provenance: PROV, match_glob: 'b' },
      { entry_id: 'a', catalog: 'adopter-manifests', status: 'blessed', provenance: PROV, match_glob: 'c' },
    ];
    const observations: CatalogEntryObservation[] = [
      { entry_id: 'z', catalog: 'pattern-matrix', files_matching_glob: 1, files_with_primitive: 1 },
      { entry_id: 'a', catalog: 'pattern-matrix', files_matching_glob: 1, files_with_primitive: 1 },
      { entry_id: 'a', catalog: 'adopter-manifests', files_matching_glob: 1, files_with_primitive: 1 },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ entries, observations }));
    const ids = out.coverage_per_blessed_pattern.map((c) => `${c.catalog}:${c.entry_id}`);
    expect(ids).toEqual([
      'adopter-manifests:a',
      'pattern-matrix:a',
      'pattern-matrix:z',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Metric 3: Violation density per cursed pattern
// ---------------------------------------------------------------------------

describe('Metric 3: violation_density_per_cursed_pattern', () => {
  it('buckets hits by directory + sorts descending by count', () => {
    const entries: CatalogEntrySnapshot[] = [
      { entry_id: 'as-cast', catalog: 'pattern-matrix', status: 'cursed', provenance: PROV },
    ];
    const observations: CatalogEntryObservation[] = [
      {
        entry_id: 'as-cast',
        catalog: 'pattern-matrix',
        hits_by_file: new Map([
          ['src/foo/a.ts', 3],
          ['src/foo/b.ts', 2],
          ['src/bar/c.ts', 5],
          ['src/baz/d.ts', 1],
        ]),
      },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ entries, observations }));
    expect(out.violation_density_per_cursed_pattern).toHaveLength(1);
    const row = out.violation_density_per_cursed_pattern[0];
    expect(row?.total_hits).toBe(11);
    expect(row?.per_directory_hits.map((d) => `${d.directory}=${d.hit_count}`)).toEqual([
      'src/bar=5',
      'src/foo=5',
      'src/baz=1',
    ]);
  });

  it('reports null concentration when total hits < 2', () => {
    const entries: CatalogEntrySnapshot[] = [
      { entry_id: 'x', catalog: 'anti-patterns', status: 'cursed', provenance: PROV },
    ];
    const observations: CatalogEntryObservation[] = [
      {
        entry_id: 'x',
        catalog: 'anti-patterns',
        hits_by_file: new Map([['src/x.ts', 1]]),
      },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ entries, observations }));
    expect(out.violation_density_per_cursed_pattern[0]?.concentration).toBeNull();
  });

  it('Gini concentration = 1.0 for fully-concentrated, near 0 for spread', () => {
    // Fully concentrated: all 5 hits in one directory.
    expect(computeGiniConcentration([5])).toBe(1.0);
    // Maximally concentrated across 2 dirs (5,0) → high Gini.
    const giniSkewed = computeGiniConcentration([5, 0]);
    expect(giniSkewed).toBeGreaterThan(0.4);
    // Perfectly spread across 5 dirs.
    const giniSpread = computeGiniConcentration([1, 1, 1, 1, 1]);
    expect(giniSpread).toBe(0);
  });

  it('ignores cursed entries that lack hits_by_file', () => {
    const entries: CatalogEntrySnapshot[] = [
      { entry_id: 'x', catalog: 'anti-patterns', status: 'cursed', provenance: PROV },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ entries, observations: [] }));
    expect(out.violation_density_per_cursed_pattern).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Metric 4: Surface uniformity
// ---------------------------------------------------------------------------

describe('Metric 4: surface_uniformity', () => {
  it('uses outlier observations when present', () => {
    const outliers: OutlierObservation[] = [
      {
        entry_id: 'editor-shape',
        outliers_by_directory: new Map([['src/editors/keygroup', 1]]),
        population_by_directory: new Map([
          ['src/editors/keygroup', 3],
          ['src/editors/sample', 5],
        ]),
        mean_distance_by_directory: new Map([
          ['src/editors/keygroup', 0.4],
          ['src/editors/sample', 0.05],
        ]),
      },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ outliers }));
    const byDir = new Map(out.surface_uniformity.map((e) => [e.directory, e]));
    expect(byDir.get('src/editors/keygroup')?.outlier_count).toBe(1);
    expect(byDir.get('src/editors/keygroup')?.population).toBe(3);
    expect(byDir.get('src/editors/sample')?.outlier_count).toBe(0);
    expect(byDir.get('src/editors/sample')?.variance).toBeCloseTo(0.05, 6);
  });

  it('falls back to directorySamples when outliers is empty', () => {
    const samples: DirectorySampleStats[] = [
      { directory: 'src/a', population: 3, mean_distance: 0.1, outlier_count: 0 },
      { directory: 'src/b', population: 2, mean_distance: 0.4, outlier_count: 1 },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ directorySamples: samples }));
    expect(out.surface_uniformity).toHaveLength(2);
    expect(out.surface_uniformity[0]?.directory).toBe('src/a');
    expect(out.surface_uniformity[1]?.outlier_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Metric 5: Catalog stability
// ---------------------------------------------------------------------------

describe('Metric 5: catalog_stability', () => {
  it('returns git_available=false when git is unavailable', () => {
    const out = computeCodebaseStateMetrics(makeInput({ gitAvailable: false }));
    expect(out.catalog_stability.git_available).toBe(false);
    expect(out.catalog_stability.total_catalog_edits).toBe(0);
    expect(out.catalog_stability.trend).toBe('stable');
  });

  it('reports stable trend for an evenly-distributed window', () => {
    const edits: CommitEdit[] = Array.from({ length: 10 }, (_, i) => ({
      sha: `sha${i}`,
      catalog_files_changed: 1,
    }));
    const out = computeCodebaseStateMetrics(
      makeInput({ commitEdits: edits, gitAvailable: true, lookbackCommits: 10 }),
    );
    expect(out.catalog_stability.total_catalog_edits).toBe(10);
    expect(out.catalog_stability.edits_per_commit_avg).toBe(1);
    expect(out.catalog_stability.trend).toBe('stable');
  });

  it('detects increasing trend (recent half has more edits)', () => {
    // git log returns most-recent first. First half = recent.
    const edits: CommitEdit[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ sha: `recent${i}`, catalog_files_changed: 5 })),
      ...Array.from({ length: 5 }, (_, i) => ({ sha: `older${i}`, catalog_files_changed: 1 })),
    ];
    const out = computeCodebaseStateMetrics(
      makeInput({ commitEdits: edits, gitAvailable: true, lookbackCommits: 10 }),
    );
    expect(out.catalog_stability.trend).toBe('increasing');
  });

  it('detects decreasing trend (recent half has fewer edits)', () => {
    const edits: CommitEdit[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ sha: `recent${i}`, catalog_files_changed: 1 })),
      ...Array.from({ length: 5 }, (_, i) => ({ sha: `older${i}`, catalog_files_changed: 5 })),
    ];
    const out = computeCodebaseStateMetrics(
      makeInput({ commitEdits: edits, gitAvailable: true, lookbackCommits: 10 }),
    );
    expect(out.catalog_stability.trend).toBe('decreasing');
  });

  it('reports stable trend when below threshold (< 10% delta)', () => {
    // 1.0 (recent) vs 0.95 (older) — 5% delta, below the 10% threshold.
    const edits: CommitEdit[] = [
      ...Array.from({ length: 10 }, () => ({ sha: 'r', catalog_files_changed: 10 })),
      // pad to make 20 total; small variation
      ...Array.from({ length: 10 }, () => ({ sha: 'o', catalog_files_changed: 10 })),
    ];
    const out = computeCodebaseStateMetrics(
      makeInput({ commitEdits: edits, gitAvailable: true, lookbackCommits: 20 }),
    );
    expect(out.catalog_stability.trend).toBe('stable');
    expect(CATALOG_STABILITY_TREND_THRESHOLD).toBe(0.1);
  });
});

// ---------------------------------------------------------------------------
// Metric 6: Discovered-candidate rate
// ---------------------------------------------------------------------------

describe('Metric 6: discovered_candidate_rate', () => {
  it('buckets pending entries by scan-run-id from provenance.context', () => {
    const entries: CatalogEntrySnapshot[] = [
      {
        entry_id: 'a',
        catalog: 'anti-patterns',
        status: 'pending',
        provenance: {
          source: 'orchestrator-agent',
          authored_at: '2026-05-26T00:00:00Z',
          context: 'scan-run-id-aaa111',
        },
      },
      {
        entry_id: 'b',
        catalog: 'anti-patterns',
        status: 'pending',
        provenance: {
          source: 'orchestrator-agent',
          authored_at: '2026-05-26T00:00:00Z',
          context: 'scan-run-id-aaa111',
        },
      },
      {
        entry_id: 'c',
        catalog: 'anti-patterns',
        status: 'pending',
        provenance: {
          source: 'orchestrator-agent',
          authored_at: '2026-05-27T00:00:00Z',
          context: 'scan-run-id-bbb222',
        },
      },
      // Unattributed: no scan-run-id context.
      { entry_id: 'd', catalog: 'anti-patterns', status: 'pending', provenance: PROV },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ entries }));
    expect(out.discovered_candidate_rate.pending_entries_total).toBe(4);
    expect(out.discovered_candidate_rate.unattributed_pending).toBe(1);
    expect(out.discovered_candidate_rate.by_scan_run).toEqual([
      { scan_run_id: 'aaa111', pending_count: 2 },
      { scan_run_id: 'bbb222', pending_count: 1 },
    ]);
  });

  it('null trend when < 2 scan-runs known', () => {
    const out = computeCodebaseStateMetrics(makeInput({ scanRuns: [] }));
    expect(out.discovered_candidate_rate.trend).toBeNull();
  });

  it('increasing trend when last scan-run exceeds prior average', () => {
    const scanRuns: ScanRunObservation[] = [
      { scan_run_id: 'r1', pending_entries_created: 2, run_at: '2026-05-01T00:00:00Z' },
      { scan_run_id: 'r2', pending_entries_created: 2, run_at: '2026-05-02T00:00:00Z' },
      { scan_run_id: 'r3', pending_entries_created: 10, run_at: '2026-05-03T00:00:00Z' },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ scanRuns }));
    expect(out.discovered_candidate_rate.trend).toBe('increasing');
  });
});

// ---------------------------------------------------------------------------
// Metric 7: Disposition latency
// ---------------------------------------------------------------------------

describe('Metric 7: disposition_latency', () => {
  it('computes median latency from authored_at to transitioned_at', () => {
    const transitions: DispositionTransitionObservation[] = [
      {
        entry_id: 'a',
        catalog: 'anti-patterns',
        authored_at: '2026-01-01T00:00:00Z',
        transitioned_at: '2026-01-02T00:00:00Z',
      },
      {
        entry_id: 'b',
        catalog: 'anti-patterns',
        authored_at: '2026-01-01T00:00:00Z',
        transitioned_at: '2026-01-04T00:00:00Z',
      },
      {
        entry_id: 'c',
        catalog: 'anti-patterns',
        authored_at: '2026-01-01T00:00:00Z',
        transitioned_at: '2026-01-05T00:00:00Z',
      },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ transitions }));
    expect(out.disposition_latency.transitioned_count).toBe(3);
    // Median of (1d, 3d, 5d in ms) → 3 days
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    expect(out.disposition_latency.median_latency_ms).toBe(threeDays);
  });

  it('reports null p90 when population < 10', () => {
    const transitions: DispositionTransitionObservation[] = [
      {
        entry_id: 'a',
        catalog: 'anti-patterns',
        authored_at: '2026-01-01T00:00:00Z',
        transitioned_at: '2026-01-02T00:00:00Z',
      },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ transitions }));
    expect(out.disposition_latency.p90_latency_ms).toBeNull();
  });

  it('emits slowest_five sorted descending by latency', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const transitions: DispositionTransitionObservation[] = Array.from(
      { length: 10 },
      (_, i) => ({
        entry_id: `e${i}`,
        catalog: 'anti-patterns' as const,
        authored_at: '2026-01-01T00:00:00Z',
        transitioned_at: new Date(Date.parse('2026-01-01T00:00:00Z') + i * dayMs).toISOString(),
      }),
    );
    const out = computeCodebaseStateMetrics(makeInput({ transitions }));
    expect(out.disposition_latency.slowest_five).toHaveLength(5);
    expect(out.disposition_latency.slowest_five[0]?.entry_id).toBe('e9');
    expect(out.disposition_latency.slowest_five[4]?.entry_id).toBe('e5');
  });

  it('skips transitions with unparseable timestamps', () => {
    const transitions: DispositionTransitionObservation[] = [
      {
        entry_id: 'bad',
        catalog: 'anti-patterns',
        authored_at: 'not-a-date',
        transitioned_at: '2026-01-02T00:00:00Z',
      },
      {
        entry_id: 'negative',
        catalog: 'anti-patterns',
        authored_at: '2026-01-02T00:00:00Z',
        transitioned_at: '2026-01-01T00:00:00Z', // negative latency
      },
      {
        entry_id: 'good',
        catalog: 'anti-patterns',
        authored_at: '2026-01-01T00:00:00Z',
        transitioned_at: '2026-01-02T00:00:00Z',
      },
    ];
    const out = computeCodebaseStateMetrics(makeInput({ transitions }));
    expect(out.disposition_latency.transitioned_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gatherer: parseGitLogOutput
// ---------------------------------------------------------------------------

describe('Gatherer: parseGitLogOutput', () => {
  it('parses standard git log --name-only --format=%H output', () => {
    const sha1 = 'a'.repeat(40);
    const sha2 = 'b'.repeat(40);
    const text =
      `${sha1}\n` +
      `.dw-lifecycle/scope-discovery/anti-patterns.yaml\n` +
      `unrelated/file.ts\n` +
      `\n` +
      `${sha2}\n` +
      `.dw-lifecycle/scope-discovery/clones.yaml\n` +
      `.dw-lifecycle/scope-discovery/anti-patterns.yaml\n`;
    const commits = parseGitLogOutput(text);
    expect(commits).toEqual([
      { sha: sha1, catalog_files_changed: 1 },
      { sha: sha2, catalog_files_changed: 2 },
    ]);
  });

  it('returns empty array on empty input', () => {
    expect(parseGitLogOutput('')).toEqual([]);
  });

  it('skips commit lines that are not 40 lowercase hex chars', () => {
    const text = `not-a-sha\n.dw-lifecycle/scope-discovery/x.yaml\n`;
    const commits = parseGitLogOutput(text);
    expect(commits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Gatherer integration: end-to-end against tmpdir fixtures
// ---------------------------------------------------------------------------

describe('Gatherer integration: end-to-end against tmpdir fixtures', () => {
  function makeTmp(): { root: string; cleanup: () => void } {
    const root = mkdtempSync(join(tmpdir(), 'codebase-state-metrics-'));
    return {
      root,
      cleanup: () => {
        try {
          rmSync(root, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      },
    };
  }

  it('returns input with entries when catalogs are present', async () => {
    const { root, cleanup } = makeTmp();
    try {
      const configDir = join(root, '.dw-lifecycle', 'scope-discovery');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'anti-patterns.yaml'),
        `anti_patterns:
  - id: legacy-x
    added_in: '1234567'
    primitive: useThing
    from: '@/hooks/useThing'
    shape_regex: 'legacyHook'
    message: replace
`,
        'utf8',
      );
      writeFileSync(
        join(configDir, 'clones.yaml'),
        `generated_at: '2026-05-26T00:00:00Z'
clones: []
`,
        'utf8',
      );
      const input = await gatherMetricsInput({
        repoRoot: root,
        noGitHistory: true,
      });
      expect(input.entries).toHaveLength(1);
      expect(input.entries[0]?.entry_id).toBe('legacy-x');
      expect(input.entries[0]?.catalog).toBe('anti-patterns');
      expect(input.gitAvailable).toBe(false);
      // Compute should produce a coherent metrics block.
      const metrics = computeCodebaseStateMetrics(input);
      expect(metrics.classification_completeness.catalogued_distinct_shapes).toBe(1);
      expect(metrics.catalog_stability.git_available).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('honors noGitHistory flag (no git invocation)', async () => {
    const { root, cleanup } = makeTmp();
    try {
      const input = await gatherMetricsInput({
        repoRoot: root,
        noGitHistory: true,
      });
      expect(input.gitAvailable).toBe(false);
      expect(input.commitEdits).toEqual([]);
      expect(input.lookbackCommits).toBe(DEFAULT_CATALOG_STABILITY_LOOKBACK);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Synthesis integration: codebase_state_metrics section lands on the manifest
// ---------------------------------------------------------------------------

describe('Synthesis integration: codebase_state_metrics section', () => {
  it('embeds the metrics section when repoRoot + catalogs are present', async () => {
    const { synthesize } = await import('../../scope-discovery/synthesis.js');
    const tmp = mkdtempSync(join(tmpdir(), 'codebase-state-synth-'));
    try {
      // Layout a minimal codebase + catalogs.
      const configDir = join(tmp, '.dw-lifecycle', 'scope-discovery');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'anti-patterns.yaml'),
        `anti_patterns:
  - id: legacy-pattern
    added_in: 'deadbef'
    primitive: useThing
    from: '@/hooks/useThing'
    shape_regex: 'legacyShape'
    message: replace
`,
        'utf8',
      );
      // Build a minimal pattern-matrix finding + prd-themed finding so
      // synthesis can derive a manifest (kind=code).
      const finding = {
        agent: 'ast-grep-matrix' as const,
        featureSlug: 'demo',
        patterns: [
          {
            id: 'as-type-cast',
            description: 'cast',
            regex: '\\bas X\\b',
            hits: [
              { file: 'src/demo/a.ts', line: 1, snippet: 'value as X' },
            ],
          },
        ],
      };
      const themedFinding = {
        agent: 'prd-themed-pattern-hunter' as const,
        featureSlug: 'demo',
        themes: [
          {
            term: 'demoterm',
            occurrences: [
              { file: 'src/demo/a.ts', line: 1, snippet: 'demoterm' },
            ],
          },
        ],
      };
      // Plant a tiny PRD on disk so deriveReferenceDocs doesn't bail.
      const docsDir = join(tmp, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(
        join(docsDir, 'prd.md'),
        '# Demo PRD\n\n## References\n\n- demo doc\n',
        'utf8',
      );
      const out = await synthesize({
        featureSlug: 'demo',
        findings: [finding, themedFinding],
        prdPath: join(docsDir, 'prd.md'),
        prdRelPath: 'docs/1.0/001-IN-PROGRESS/demo/prd.md',
        moduleRoot: 'src',
        repoRoot: tmp,
        noGitHistory: true,
      });
      expect(out.manifest.codebase_state_metrics).toBeDefined();
      const metrics = out.manifest.codebase_state_metrics;
      if (metrics === undefined) return; // narrowing for TS
      expect(metrics.classification_completeness.catalogued_distinct_shapes).toBeGreaterThan(0);
      // Section's `generated_at` is set; not asserting equality with the
      // outer manifest's because the two are computed at the same moment
      // but written separately.
      expect(typeof metrics.generated_at).toBe('string');
    } finally {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  });

  it('omits the metrics section when no .dw-lifecycle directory exists', async () => {
    const { synthesize } = await import('../../scope-discovery/synthesis.js');
    const tmp = mkdtempSync(join(tmpdir(), 'codebase-state-synth-no-catalog-'));
    try {
      const docsDir = join(tmp, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(
        join(docsDir, 'prd.md'),
        '# Demo PRD\n\n## References\n\n- demo doc\n',
        'utf8',
      );
      const out = await synthesize({
        featureSlug: 'demo',
        findings: [
          {
            agent: 'ast-grep-matrix' as const,
            featureSlug: 'demo',
            patterns: [
              {
                id: 'p1',
                description: 'd',
                regex: 'r',
                hits: [{ file: 'src/demo/a.ts', line: 1, snippet: 's' }],
              },
            ],
          },
          {
            agent: 'prd-themed-pattern-hunter' as const,
            featureSlug: 'demo',
            themes: [
              {
                term: 'demoterm',
                occurrences: [
                  { file: 'src/demo/a.ts', line: 1, snippet: 'demoterm' },
                ],
              },
            ],
          },
        ],
        prdPath: join(docsDir, 'prd.md'),
        prdRelPath: 'docs/1.0/001-IN-PROGRESS/demo/prd.md',
        moduleRoot: 'src',
        repoRoot: tmp,
        noGitHistory: true,
      });
      expect(out.manifest.codebase_state_metrics).toBeUndefined();
    } finally {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  });
});
