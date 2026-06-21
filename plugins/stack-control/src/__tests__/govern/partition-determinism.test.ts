// 030 T014 (RED first) — FR-004 / US1 Scenario 3: the cluster-payload aggregate
// (couple→cluster→trim→binpack→manifest) is deterministic — partitioning twice
// over identical input yields byte-identical chunks / chunkIds / manifests /
// splitClusterMarkers. Also pins the no-file-dropped invariant (⋃ files ==
// changed set). Watched to FAIL while partitionDiff does not exist (T020 makes
// it pass).

import { describe, expect, it } from 'vitest';
import { partitionDiff } from '../../govern/cluster-payload/partition.js';

const changedFiles = ['src/g/a.ts', 'src/g/b.ts', 'src/g/c.ts', 'src/other/z.ts'];
const fileDiffs = new Map<string, string>([
  ['src/g/a.ts', 'x'.repeat(200)],
  ['src/g/b.ts', 'x'.repeat(200)],
  ['src/g/c.ts', 'x'.repeat(200)],
  ['src/other/z.ts', 'x'.repeat(50)],
]);

describe('030 T014 — partition determinism (FR-004)', () => {
  it('yields byte-identical output over identical input (incl. split markers)', () => {
    const r1 = partitionDiff({ changedFiles, fileDiffs }, 250); // src/g cluster (600) > 250 ⇒ sub-split
    const r2 = partitionDiff({ changedFiles, fileDiffs }, 250);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(r1.splitClusterMarkers.length).toBe(1);
  });

  it('drops no file — the union of all chunk files equals the changed set', () => {
    const r = partitionDiff({ changedFiles, fileDiffs }, 250);
    expect(r.chunks.flatMap((c) => [...c.files]).sort()).toEqual([...changedFiles].sort());
    expect(r.chunkIds).toEqual(r.chunks.map((c) => c.id));
  });
});
