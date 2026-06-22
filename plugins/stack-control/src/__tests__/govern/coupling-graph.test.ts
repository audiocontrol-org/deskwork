// 030 T010 (RED first) — FR-003 / R1: the coupling graph is built over the
// changed-file set with a universal, language-agnostic baseline
// (directory-adjacency + diff cross-references) plus an additive TS import layer
// that is used only when present, never required. Watched to FAIL while
// buildCouplingGraph is a 'not implemented' stub (Phase 3 T016 makes it pass).

import { describe, expect, it } from 'vitest';
import { buildCouplingGraph, type CouplingGraph, type CouplingSignal } from '../../govern/cluster-payload/coupling-graph.js';

function hasEdge(g: CouplingGraph, a: string, b: string, signal: CouplingSignal): boolean {
  return g.edges.some(
    (e) => e.signal === signal && ((e.from === a && e.to === b) || (e.from === b && e.to === a)),
  );
}

describe('030 T010 — coupling graph (FR-003, R1)', () => {
  it('adds a directory-adjacency edge between same-directory changed files', () => {
    const g = buildCouplingGraph({ changedFiles: ['src/a/x.ts', 'src/a/y.ts', 'src/b/z.ts'] });
    expect(hasEdge(g, 'src/a/x.ts', 'src/a/y.ts', 'dir')).toBe(true);
    expect(hasEdge(g, 'src/a/x.ts', 'src/b/z.ts', 'dir')).toBe(false);
  });

  it('adds a diff cross-reference edge when one file diff mentions another changed file', () => {
    const fileDiffs = new Map<string, string>([
      ['src/a.ts', 'import { foo } from "./b.js";'],
      ['src/b.ts', 'export const foo = 1;'],
    ]);
    const g = buildCouplingGraph({ changedFiles: ['src/a.ts', 'src/b.ts'], fileDiffs });
    expect(hasEdge(g, 'src/a.ts', 'src/b.ts', 'diff-xref')).toBe(true);
  });

  it('adds TS import edges only when provided; baseline-only otherwise', () => {
    const withTs = buildCouplingGraph({
      changedFiles: ['src/a.ts', 'src/deep/c.ts'],
      tsImportEdges: [{ from: 'src/a.ts', to: 'src/deep/c.ts', signal: 'ts-import' }],
    });
    expect(hasEdge(withTs, 'src/a.ts', 'src/deep/c.ts', 'ts-import')).toBe(true);

    const withoutTs = buildCouplingGraph({ changedFiles: ['src/a.ts', 'src/deep/c.ts'] });
    expect(withoutTs.edges.some((e) => e.signal === 'ts-import')).toBe(false);
  });

  it('includes every changed file as a node (no file dropped)', () => {
    const g = buildCouplingGraph({ changedFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'] });
    expect([...g.files].sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });
});
