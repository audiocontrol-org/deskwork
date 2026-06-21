// 030 T037 (RED first) — FR-005 / R8 / US3 Scenario 2: each chunk's manifest
// lists exactly the OTHER chunks' file lists (complete, no self-entry, file-lists
// only — no diff bodies). Pulled forward into US1 because the cluster-payload
// aggregate (T020) emits manifests. Watched to FAIL while buildChunkManifests is
// a 'not implemented' stub (T040 makes it pass).

import { describe, expect, it } from 'vitest';
import { buildChunkManifests } from '../../govern/chunk-manifest.js';
import type { Chunk } from '../../govern/chunk-artifacts.js';

function defined<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('expected a defined value');
  return v;
}

const chunks: Chunk[] = [
  { id: 'c1', files: ['a.ts'], splitCluster: false, renderedBytes: 10 },
  { id: 'c2', files: ['b.ts', 'c.ts'], splitCluster: false, renderedBytes: 20 },
  { id: 'c3', files: ['d.ts'], splitCluster: false, renderedBytes: 5 },
];

describe('030 T037 — chunk manifest (FR-005, R8)', () => {
  it('lists exactly the other chunks file lists, no self-entry', () => {
    const ms = buildChunkManifests(chunks);
    const m1 = defined(ms.find((m) => m.chunkId === 'c1'));
    expect(m1.otherChunks).toEqual([
      { id: 'c2', files: ['b.ts', 'c.ts'] },
      { id: 'c3', files: ['d.ts'] },
    ]);
    expect(m1.otherChunks.some((o) => o.id === 'c1')).toBe(false);
  });

  it('produces exactly one manifest per chunk', () => {
    const ms = buildChunkManifests(chunks);
    expect(ms.map((m) => m.chunkId).sort()).toEqual(['c1', 'c2', 'c3']);
  });
});
