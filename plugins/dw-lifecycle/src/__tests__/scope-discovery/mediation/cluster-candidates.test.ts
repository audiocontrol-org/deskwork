/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/mediation/cluster-candidates.test.ts
 *
 * Phase 11 Task 3 — cluster-candidates tests. The clusterer takes raw
 * DiscoveryAgentFinding[] and produces Candidate[] grouped by shape
 * similarity (Jaccard n-gram). The tests pin the deterministic
 * clustering behavior end-to-end without mocking the filesystem.
 *
 * Test fixtures are synthetic findings constructed in-memory; per
 * testing.md "use fixture project trees on disk, never mock the
 * filesystem" applies only to FS-dependent tests. The clusterer is
 * pure compute over JSON-shaped inputs, so in-memory fixtures are the
 * correct testbed.
 */

import { describe, it, expect } from 'vitest';
import type {
  AstGrepMatrixFindings,
  PatternFinding,
  PatternHit,
} from '../../../scope-discovery/discovery-agents/types.js';
import {
  clusterCandidates,
  jaccard,
  ngrams,
} from '../../../scope-discovery/mediation/cluster-candidates.js';
import { DEFAULT_CLUSTERING_CONFIG } from '../../../scope-discovery/mediation/mediation-types.js';

// ---------------------------------------------------------------------------
// Helpers — build synthetic findings without touching disk.
// ---------------------------------------------------------------------------

function makeHit(file: string, line: number, snippet: string): PatternHit {
  return { file, line, snippet };
}

function makePattern(
  id: string,
  description: string,
  regex: string,
  hits: ReadonlyArray<PatternHit>,
  provenance?: PatternFinding['provenance'],
): PatternFinding {
  const base = {
    id,
    description,
    regex,
    hits,
  };
  return provenance !== undefined ? { ...base, provenance } : base;
}

function makeFinding(
  patterns: ReadonlyArray<PatternFinding>,
): AstGrepMatrixFindings {
  return {
    agent: 'ast-grep-matrix',
    featureSlug: 'test',
    patterns,
  };
}

// ---------------------------------------------------------------------------
// jaccard()
// ---------------------------------------------------------------------------

describe('jaccard()', () => {
  it('returns 1.0 for identical sets', () => {
    const a = new Set(['abc', 'bcd', 'cde']);
    const b = new Set(['abc', 'bcd', 'cde']);
    expect(jaccard(a, b)).toBe(1.0);
  });

  it('returns 0 for disjoint sets', () => {
    const a = new Set(['abc', 'bcd']);
    const b = new Set(['xyz', 'wvu']);
    expect(jaccard(a, b)).toBe(0);
  });

  it('returns 0 for both-empty sets', () => {
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  it('returns intersection/union for partial overlap', () => {
    const a = new Set(['a', 'b', 'c']);
    const b = new Set(['b', 'c', 'd']);
    // intersection = {b, c} = 2; union = {a, b, c, d} = 4; 2/4 = 0.5
    expect(jaccard(a, b)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// ngrams()
// ---------------------------------------------------------------------------

describe('ngrams()', () => {
  it('produces sliding-window n-grams of size n', () => {
    const result = ngrams('hello', 3);
    expect(Array.from(result).sort()).toEqual(['ell', 'hel', 'llo']);
  });

  it('lower-cases input', () => {
    const result = ngrams('HELLO', 3);
    expect(Array.from(result).sort()).toEqual(['ell', 'hel', 'llo']);
  });

  it('trims whitespace', () => {
    const result = ngrams('  abc  ', 3);
    expect(Array.from(result)).toEqual(['abc']);
  });

  it('returns empty set for empty input', () => {
    expect(ngrams('', 3).size).toBe(0);
  });

  it('pads short inputs to size n with spaces', () => {
    const result = ngrams('ab', 4);
    expect(result.size).toBe(1);
    expect(Array.from(result)[0]).toBe('ab  ');
  });

  it('throws on non-positive n', () => {
    expect(() => ngrams('hello', 0)).toThrow();
    expect(() => ngrams('hello', -1)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// clusterCandidates() — empty + single-pattern inputs
// ---------------------------------------------------------------------------

describe('clusterCandidates() — degenerate inputs', () => {
  it('returns empty array for empty findings', () => {
    expect(clusterCandidates([])).toEqual([]);
  });

  it('returns empty array when no ast-grep-matrix findings are present', () => {
    // Other agents are ignored by the pattern clusterer; non-AST
    // findings produce zero clusters.
    const findings = [
      {
        agent: 'ui-route-enumerator' as const,
        featureSlug: 'test',
        modulesInScope: [],
        routes: [
          {
            module: '.',
            path: '/home',
            file: 'src/routes.tsx',
            pageFile: null,
          },
        ],
      },
    ];
    expect(clusterCandidates(findings)).toEqual([]);
  });

  it('returns single-member cluster for a single hit', () => {
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [makeHit('a.tsx', 1, 'flex grid')]),
      ]),
    ];
    const result = clusterCandidates(findings);
    expect(result.length).toBe(1);
    expect(result[0]?.members.length).toBe(1);
    expect(result[0]?.members[0]?.file).toBe('a.tsx');
    expect(result[0]?.members[0]?.line).toBe(1);
    expect(result[0]?.id).toBe('cluster-0000');
  });
});

// ---------------------------------------------------------------------------
// clusterCandidates() — grouping behavior
// ---------------------------------------------------------------------------

describe('clusterCandidates() — similarity-based grouping', () => {
  it('groups shape-similar hits into one cluster', () => {
    // Three nearly-identical excerpts; should land in the same cluster.
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [
          makeHit('a.tsx', 1, 'className="flex absolute bg-slate-50"'),
          makeHit('b.tsx', 5, 'className="flex absolute bg-slate-100"'),
          makeHit('c.tsx', 9, 'className="flex absolute bg-slate-200"'),
        ]),
      ]),
    ];
    const result = clusterCandidates(findings);
    expect(result.length).toBe(1);
    expect(result[0]?.members.length).toBe(3);
  });

  it('splits dissimilar shapes into separate clusters', () => {
    // Two completely different excerpts → two clusters.
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [
          makeHit('a.tsx', 1, 'className="flex absolute bg-slate-50"'),
          makeHit('b.tsx', 5, 'const xyz = 42; return null;'),
        ]),
      ]),
    ];
    const result = clusterCandidates(findings);
    expect(result.length).toBe(2);
  });

  it('handles multi-hit findings (expands hits into individual members)', () => {
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [
          // Near-identical excerpts above the 0.7 Jaccard threshold.
          makeHit('a.tsx', 1, 'className="flex absolute bg-slate-50"'),
          makeHit('a.tsx', 2, 'className="flex absolute bg-slate-100"'),
          makeHit('a.tsx', 3, 'className="flex absolute bg-slate-200"'),
        ]),
      ]),
    ];
    const result = clusterCandidates(findings);
    expect(result.length).toBe(1);
    expect(result[0]?.members.length).toBe(3);
    expect(result[0]?.members.map((m) => m.line)).toEqual([1, 2, 3]);
  });

  it('produces deterministic cluster ids across re-runs', () => {
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [
          makeHit('a.tsx', 1, 'className="flex absolute bg-slate-50"'),
          makeHit('b.tsx', 5, 'className="flex absolute bg-slate-100"'),
        ]),
      ]),
    ];
    const r1 = clusterCandidates(findings);
    const r2 = clusterCandidates(findings);
    expect(r1.map((c) => c.id)).toEqual(r2.map((c) => c.id));
    expect(r1.map((c) => c.summary)).toEqual(r2.map((c) => c.summary));
  });
});

// ---------------------------------------------------------------------------
// Cluster summaries
// ---------------------------------------------------------------------------

describe('clusterCandidates() — summary synthesis', () => {
  it('names member + file counts in the summary', () => {
    const findings = [
      makeFinding([
        makePattern(
          'p1',
          'descr',
          'r',
          [
            // Highly-similar excerpts (jaccard ~0.82) so they join.
            makeHit('a.tsx', 1, 'className="flex absolute bg-slate-50"'),
            makeHit('b.tsx', 5, 'className="flex absolute bg-slate-100"'),
          ],
          'negative-space',
        ),
      ]),
    ];
    const result = clusterCandidates(findings);
    expect(result[0]?.summary).toContain('2 matches');
    expect(result[0]?.summary).toContain('2 file(s)');
  });

  it('surfaces provenance distribution in the summary when present', () => {
    const findings = [
      makeFinding([
        makePattern(
          'p1',
          'descr',
          'r',
          [makeHit('a.tsx', 1, 'flex grid absolute')],
          'negative-space',
        ),
      ]),
    ];
    const result = clusterCandidates(findings);
    expect(result[0]?.summary).toContain('negative-space:1');
  });

  it('emits "Representative shape:" in every summary', () => {
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [makeHit('a.tsx', 1, 'flex grid')]),
      ]),
    ];
    const result = clusterCandidates(findings);
    expect(result[0]?.summary).toContain('Representative shape:');
  });
});

// ---------------------------------------------------------------------------
// Config — threshold + minClusterSize knobs
// ---------------------------------------------------------------------------

describe('clusterCandidates() — config knobs', () => {
  it('a lower jaccardThreshold groups more aggressively', () => {
    // Partially-similar excerpts; jaccard between them is ~0.55
    // (above 0.5 but below default 0.7).
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [
          makeHit('a.tsx', 1, 'flex grid absolute relative'),
          makeHit('b.tsx', 5, 'flex grid absolute extra-shape'),
        ]),
      ]),
    ];
    // Strict default threshold → two clusters.
    const strict = clusterCandidates(findings, {
      ...DEFAULT_CLUSTERING_CONFIG,
      jaccardThreshold: 0.7,
    });
    expect(strict.length).toBe(2);
    // Lower threshold → joins them into one cluster.
    const lax = clusterCandidates(findings, {
      ...DEFAULT_CLUSTERING_CONFIG,
      jaccardThreshold: 0.3,
    });
    expect(lax.length).toBe(1);
  });

  it('throws on invalid jaccardThreshold (out of (0, 1])', () => {
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [makeHit('a.tsx', 1, 'flex')]),
      ]),
    ];
    expect(() =>
      clusterCandidates(findings, { ...DEFAULT_CLUSTERING_CONFIG, jaccardThreshold: 0 }),
    ).toThrow();
    expect(() =>
      clusterCandidates(findings, { ...DEFAULT_CLUSTERING_CONFIG, jaccardThreshold: 1.5 }),
    ).toThrow();
  });

  it('throws on invalid minClusterSize (< 1)', () => {
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [makeHit('a.tsx', 1, 'flex')]),
      ]),
    ];
    expect(() =>
      clusterCandidates(findings, { ...DEFAULT_CLUSTERING_CONFIG, minClusterSize: 0 }),
    ).toThrow();
  });

  it('minClusterSize filters singletons when set > 1', () => {
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [
          // Two similar (cluster together); one disjoint singleton.
          makeHit('a.tsx', 1, 'className="flex absolute bg-slate-50"'),
          makeHit('b.tsx', 5, 'className="flex absolute bg-slate-100"'),
          makeHit('c.tsx', 9, 'unique shape that-clusters-alone'),
        ]),
      ]),
    ];
    const result = clusterCandidates(findings, {
      ...DEFAULT_CLUSTERING_CONFIG,
      minClusterSize: 2,
    });
    // Only the multi-member cluster survives.
    expect(result.length).toBe(1);
    expect(result[0]?.members.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Stability + ordering
// ---------------------------------------------------------------------------

describe('clusterCandidates() — stability + ordering', () => {
  it('preserves input order within a cluster', () => {
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [
          // Highly similar excerpts (jaccard ~0.82) all cluster together.
          makeHit('z.tsx', 1, 'className="flex absolute bg-slate-50"'),
          makeHit('a.tsx', 5, 'className="flex absolute bg-slate-100"'),
          makeHit('m.tsx', 9, 'className="flex absolute bg-slate-200"'),
        ]),
      ]),
    ];
    const result = clusterCandidates(findings);
    expect(result.length).toBe(1);
    expect(result[0]?.members.map((m) => m.file)).toEqual([
      'z.tsx',
      'a.tsx',
      'm.tsx',
    ]);
  });

  it('orders clusters by cluster-open order (== cluster-id ordering)', () => {
    const findings = [
      makeFinding([
        makePattern('p1', 'descr', 'r', [
          // Highly-similar excerpts open one cluster (a + c).
          makeHit('a.tsx', 1, 'className="flex absolute bg-slate-50"'),
          // Disjoint shape opens a second cluster (b).
          makeHit('b.tsx', 5, 'distinct-shape unique-vocabulary xyz'),
          // Similar to the first → joins cluster-0000.
          makeHit('c.tsx', 9, 'className="flex absolute bg-slate-100"'),
        ]),
      ]),
    ];
    const result = clusterCandidates(findings);
    expect(result.map((c) => c.id)).toEqual(['cluster-0000', 'cluster-0001']);
    expect(result[0]?.members.length).toBe(2); // a + c
    expect(result[1]?.members.length).toBe(1); // b
  });
});
