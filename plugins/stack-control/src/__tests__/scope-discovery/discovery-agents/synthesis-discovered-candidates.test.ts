/**
 * Tests for the unmatched-shape clustering algorithm (#318).
 *
 * Coverage:
 *   - Empty input → empty output.
 *   - All files covered → empty output.
 *   - Fewer than MIN_CLUSTER_SIZE uncovered files → empty output.
 *   - 3 near-identical files (high Jaccard) form one cluster; member
 *     count and order verified.
 *   - 3 near-identical + 3 distinct files form one cluster (the 3
 *     similar), 3 singletons filtered.
 *   - Two distinct clusters (3 + 3 near-identical, mutually unlike)
 *     emerge as two separate clusters ranked by size (tie → tertiary
 *     stable tiebreak on smallest member file path).
 *   - Distinctiveness ranking: when two clusters have equal member
 *     count, the one less similar to covered shapes ranks first.
 *   - Cluster id is deterministic across calls with identical input
 *     and stable under member reordering.
 *   - Bag-of-words summary surfaces high-frequency n-grams.
 *   - Files that tokenize to fewer than NGRAM_MIN tokens are dropped.
 *   - Comments and string literals don't drive clustering.
 */

import { describe, it, expect } from 'vitest';
import {
  clusterUnmatchedShapes,
  type ClusterUnmatchedShapesInput,
} from '../../../scope-discovery/discovery-agents/synthesis-discovered-candidates.js';
import type { SourceFileView } from '../../../scope-discovery/discovery-agents/shared.js';
import type { PatternFinding } from '../../../scope-discovery/discovery-agents/types.js';

function view(file: string, text: string): SourceFileView {
  return { file, text, lines: text.split(/\r?\n/) };
}

function finding(file: string, line = 1): PatternFinding {
  return {
    id: 'test-pattern',
    description: 'test',
    regex: '.',
    hits: [{ file, line, snippet: '' }],
  };
}

/**
 * Produces a body whose token stream is the given vocabulary, repeated.
 * Repetition guarantees enough tokens to form n-grams (n=3..5) and
 * keeps the vocabulary specific to this group — no shared filler that
 * would inflate cross-group Jaccard similarity.
 */
function bodyOf(...vocab: string[]): string {
  // Rotate the vocabulary so adjacent-token n-grams cover all permutations
  // of the vocab, but distinct vocabularies share zero tokens.
  const repeated: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    for (const v of vocab) repeated.push(v);
  }
  return repeated.join(' ');
}

describe('clusterUnmatchedShapes (#318)', () => {
  it('empty input → empty output', () => {
    const out = clusterUnmatchedShapes({ scans: [], findings: [] });
    expect(out).toEqual([]);
  });

  it('all files covered → empty output', () => {
    const input: ClusterUnmatchedShapesInput = {
      scans: [
        view('a.ts', bodyOf('foo', 'bar', 'baz', 'qux')),
        view('b.ts', bodyOf('foo', 'bar', 'baz', 'qux')),
        view('c.ts', bodyOf('foo', 'bar', 'baz', 'qux')),
      ],
      findings: [finding('a.ts'), finding('b.ts'), finding('c.ts')],
    };
    const out = clusterUnmatchedShapes(input);
    expect(out).toEqual([]);
  });

  it('fewer than MIN_CLUSTER_SIZE uncovered files → empty output', () => {
    const input: ClusterUnmatchedShapesInput = {
      scans: [
        view('a.ts', bodyOf('foo', 'bar', 'baz')),
        view('b.ts', bodyOf('foo', 'bar', 'baz')),
      ],
      findings: [],
    };
    const out = clusterUnmatchedShapes(input);
    expect(out).toEqual([]);
  });

  it('3 near-identical files form one cluster', () => {
    // Three files with identical tokens → identical n-gram sets → Jaccard 1.0.
    const text = bodyOf('alpha', 'beta', 'gamma', 'delta', 'epsilon');
    const input: ClusterUnmatchedShapesInput = {
      scans: [view('x.ts', text), view('y.ts', text), view('z.ts', text)],
      findings: [],
    };
    const out = clusterUnmatchedShapes(input);
    expect(out).toHaveLength(1);
    const cluster = out[0];
    expect(cluster).toBeDefined();
    if (!cluster) return;
    expect(cluster.memberCount).toBe(3);
    expect(cluster.members).toEqual(['x.ts', 'y.ts', 'z.ts']);
    expect(cluster.id).toMatch(/^cluster-[0-9a-f]{8}$/);
    expect(cluster.shapeSummary.length).toBeGreaterThan(0);
  });

  it('3 near-identical + 3 mutually-distinct → one cluster (the 3 similar), singletons filtered', () => {
    const sharedText = bodyOf('alpha', 'beta', 'gamma', 'delta', 'epsilon');
    const input: ClusterUnmatchedShapesInput = {
      scans: [
        view('similar1.ts', sharedText),
        view('similar2.ts', sharedText),
        view('similar3.ts', sharedText),
        // Mutually distinct: each has a unique vocabulary set with no overlap.
        view('distinct1.ts', bodyOf('one', 'two', 'three', 'four', 'five')),
        view('distinct2.ts', bodyOf('apple', 'banana', 'cherry', 'date', 'fig')),
        view(
          'distinct3.ts',
          bodyOf('red', 'green', 'blue', 'yellow', 'purple'),
        ),
      ],
      findings: [],
    };
    const out = clusterUnmatchedShapes(input);
    expect(out).toHaveLength(1);
    expect(out[0]?.memberCount).toBe(3);
    expect(out[0]?.members).toEqual(['similar1.ts', 'similar2.ts', 'similar3.ts']);
  });

  it('two distinct clusters of equal size emerge separately, ranked by stable tiebreak', () => {
    const groupA = bodyOf('alpha', 'beta', 'gamma', 'delta', 'epsilon');
    const groupB = bodyOf('one', 'two', 'three', 'four', 'five');
    const input: ClusterUnmatchedShapesInput = {
      scans: [
        view('a1.ts', groupA),
        view('a2.ts', groupA),
        view('a3.ts', groupA),
        view('b1.ts', groupB),
        view('b2.ts', groupB),
        view('b3.ts', groupB),
      ],
      findings: [],
    };
    const out = clusterUnmatchedShapes(input);
    expect(out).toHaveLength(2);
    expect(out[0]?.memberCount).toBe(3);
    expect(out[1]?.memberCount).toBe(3);
    // With covered shapes empty, distinctiveness collapses to 1 for
    // both. Tertiary tiebreak: smallest member file path; 'a1.ts'
    // sorts before 'b1.ts'.
    expect(out[0]?.members).toEqual(['a1.ts', 'a2.ts', 'a3.ts']);
    expect(out[1]?.members).toEqual(['b1.ts', 'b2.ts', 'b3.ts']);
  });

  it('cluster id is deterministic + stable under member reordering', () => {
    const text = bodyOf('alpha', 'beta', 'gamma', 'delta', 'epsilon');
    const inputA: ClusterUnmatchedShapesInput = {
      scans: [view('x.ts', text), view('y.ts', text), view('z.ts', text)],
      findings: [],
    };
    const inputB: ClusterUnmatchedShapesInput = {
      // Same files, reversed input order.
      scans: [view('z.ts', text), view('y.ts', text), view('x.ts', text)],
      findings: [],
    };
    const outA = clusterUnmatchedShapes(inputA);
    const outB = clusterUnmatchedShapes(inputB);
    expect(outA[0]?.id).toBe(outB[0]?.id);
    expect(outA[0]?.members).toEqual(outB[0]?.members);
  });

  it('bag-of-words summary surfaces high-frequency n-grams', () => {
    // Three identical files; every n-gram occurs 3 times.
    const text = bodyOf('foo', 'bar', 'baz', 'qux');
    const input: ClusterUnmatchedShapesInput = {
      scans: [view('p.ts', text), view('q.ts', text), view('r.ts', text)],
      findings: [],
    };
    const out = clusterUnmatchedShapes(input);
    expect(out).toHaveLength(1);
    const summary = out[0]?.shapeSummary ?? '';
    // Summary contains comma-separated n-gram strings.
    expect(summary).toContain(',');
    // 'foo bar baz' is a 3-gram that should appear in the top-K.
    expect(summary).toContain('foo bar baz');
  });

  it('files that tokenize to fewer than NGRAM_MIN tokens are dropped', () => {
    const input: ClusterUnmatchedShapesInput = {
      scans: [
        view('tiny1.ts', 'a b'), // 2 tokens → fewer than n=3 → 0 n-grams
        view('tiny2.ts', 'c d'),
        view('tiny3.ts', 'e f'),
      ],
      findings: [],
    };
    const out = clusterUnmatchedShapes(input);
    expect(out).toEqual([]);
  });

  it('comments and string literals do not drive clustering', () => {
    // Two files: same alphanumeric body, but one has wildly different
    // comments + string literals. They should still cluster (tokens
    // are equivalent after stripping comments/strings).
    const sharedTokens = bodyOf('alpha', 'beta', 'gamma', 'delta', 'epsilon');
    const a = `// comment alpha\n${sharedTokens}\n"string alpha"`;
    const b = `/* totally different block comment */\n${sharedTokens}\n'string omega'`;
    const c = `<!-- markdown comment foo -->\n${sharedTokens}\n\`template literal\``;
    const input: ClusterUnmatchedShapesInput = {
      scans: [view('a.ts', a), view('b.ts', b), view('c.md', c)],
      findings: [],
    };
    const out = clusterUnmatchedShapes(input);
    expect(out).toHaveLength(1);
    expect(out[0]?.memberCount).toBe(3);
    expect(out[0]?.members).toEqual(['a.ts', 'b.ts', 'c.md']);
  });

  it('distinctiveness ranking: equal-size clusters, less covered-similar ranks first', () => {
    // Two equal-size clusters (3 each). Cluster X is very similar to
    // a covered file; cluster Y is distinct from anything covered.
    // Y should rank above X by the distinctiveness tiebreaker.
    const xText = bodyOf('alpha', 'beta', 'gamma', 'delta', 'epsilon');
    const yText = bodyOf('lambda', 'mu', 'nu', 'xi', 'omicron');
    const input: ClusterUnmatchedShapesInput = {
      scans: [
        // Covered (similar to X's vocabulary):
        view('covered1.ts', xText),
        // X cluster (uncovered, similar to covered1):
        view('x1.ts', xText),
        view('x2.ts', xText),
        view('x3.ts', xText),
        // Y cluster (uncovered, distinct from covered):
        view('y1.ts', yText),
        view('y2.ts', yText),
        view('y3.ts', yText),
      ],
      findings: [finding('covered1.ts')],
    };
    const out = clusterUnmatchedShapes(input);
    expect(out).toHaveLength(2);
    expect(out[0]?.memberCount).toBe(3);
    expect(out[1]?.memberCount).toBe(3);
    // Y should rank first (more distinctive from covered).
    expect(out[0]?.members[0]).toBe('y1.ts');
    expect(out[1]?.members[0]).toBe('x1.ts');
  });

  it('mixed covered + uncovered: only uncovered cluster surfaces', () => {
    const sharedText = bodyOf('alpha', 'beta', 'gamma', 'delta', 'epsilon');
    const input: ClusterUnmatchedShapesInput = {
      scans: [
        view('covered1.ts', sharedText),
        view('covered2.ts', sharedText),
        view('uncovered1.ts', sharedText),
        view('uncovered2.ts', sharedText),
        view('uncovered3.ts', sharedText),
      ],
      findings: [finding('covered1.ts'), finding('covered2.ts')],
    };
    const out = clusterUnmatchedShapes(input);
    expect(out).toHaveLength(1);
    expect(out[0]?.members).toEqual(['uncovered1.ts', 'uncovered2.ts', 'uncovered3.ts']);
  });
});
