// 030 T043 (RED first) — FR-012 / FR-007 / US4 Scenarios 1+3: the touched set is
// the fixed files' own chunks PLUS any chunk a fixed file is coupled into
// (coupling-correct); a fix-created NEW file is assigned to a chunk by coupling
// rather than dropped (the split-file-audit-exclusion class must not recur).
// Watched to FAIL while computeTouchedSet is a 'not implemented' stub (T046).

import { describe, expect, it } from 'vitest';
import { computeTouchedSet } from '../../govern/touched-set.js';
import { buildCouplingGraph } from '../../govern/cluster-payload/coupling-graph.js';
import type { Chunk } from '../../govern/chunk-artifacts.js';

const chunks: Chunk[] = [
  { id: 'cA', files: ['x/a.ts'], splitCluster: false, renderedBytes: 10 },
  { id: 'cB', files: ['y/b.ts'], splitCluster: false, renderedBytes: 10 },
  { id: 'cC', files: ['z/c.ts'], splitCluster: false, renderedBytes: 10 },
];

describe('030 T043 — touched-set coupling-correctness (FR-012/FR-007)', () => {
  it('includes a fixed file own chunk plus the chunks it is coupled into', () => {
    // a coupled to b only (diff-xref), not c.
    const coupling = buildCouplingGraph({
      changedFiles: ['x/a.ts', 'y/b.ts', 'z/c.ts'],
      fileDiffs: new Map<string, string>([['x/a.ts', 'import "../y/b.js"']]),
    });
    const ts = computeTouchedSet({ round: 2, chunks, coupling, changedFiles: ['x/a.ts'], fixCommits: ['sha1'] });
    expect([...ts.chunkIds].sort()).toEqual(['cA', 'cB']); // own cA + coupled cB; NOT cC
    expect(ts.round).toBe(2);
    expect(ts.sourceFixCommits).toEqual(['sha1']);
  });

  it('assigns a fix-created new file to a chunk by coupling (not dropped)', () => {
    // new.ts is created by a fix, coupled to x/a.ts (same dir x).
    const coupling = buildCouplingGraph({ changedFiles: ['x/a.ts', 'x/new.ts'] }); // same dir ⇒ coupled
    const ts = computeTouchedSet({ round: 3, chunks, coupling, changedFiles: ['x/new.ts'], fixCommits: ['sha2'] });
    expect(ts.newFiles).toContain('x/new.ts');
    expect(ts.chunkIds).toContain('cA'); // assigned to a's chunk by coupling
  });
});
