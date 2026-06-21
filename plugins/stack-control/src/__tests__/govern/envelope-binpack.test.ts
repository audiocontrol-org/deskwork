// 030 T013 (RED first) — FR-002 / FR-006 / R2: first-fit-decreasing packs
// clusters into chunks each ≤ envelope; an oversized MULTI-file cluster (after
// the trim pre-pass) sub-splits into ≥2 sub-chunks with a SplitClusterMarker
// (non-empty coverage caveat) and NEVER throws boundary-too-large. A single FILE
// whose own diff exceeds the envelope is a-priori-broken → FAIL LOUD (operator
// decision 2026-06-21; not the never-FATAL feature-size case). Watched to FAIL
// while binpackClusters is a 'not implemented' stub (Phase 3 T019 makes it pass).

import { describe, expect, it } from 'vitest';
import { binpackClusters } from '../../govern/cluster-payload/envelope-binpack.js';
import { clusterFiles } from '../../govern/cluster-payload/clustering.js';
import { buildCouplingGraph } from '../../govern/cluster-payload/coupling-graph.js';

function clustersOf(files: string[]) {
  return clusterFiles(buildCouplingGraph({ changedFiles: files }));
}
function diffsOf(sizes: Record<string, number>): Map<string, string> {
  return new Map(Object.entries(sizes).map(([f, n]) => [f, 'x'.repeat(n)]));
}

describe('030 T013 — envelope bin-pack (FR-002/FR-006, R2)', () => {
  it('packs isolated clusters into chunks each within the envelope; no split markers', () => {
    const files = ['a/a.ts', 'b/b.ts', 'c/c.ts', 'd/d.ts']; // four singletons (distinct dirs)
    const r = binpackClusters(clustersOf(files), diffsOf({ 'a/a.ts': 100, 'b/b.ts': 100, 'c/c.ts': 100, 'd/d.ts': 100 }), 250);
    expect(r.splitClusterMarkers).toEqual([]);
    expect(r.chunks.every((c) => c.renderedBytes <= 250)).toBe(true);
    expect(r.chunks.flatMap((c) => [...c.files]).sort()).toEqual([...files].sort());
  });

  it('sub-splits an oversized multi-file cluster, records a SplitClusterMarker, never throws', () => {
    const files = ['src/g/a.ts', 'src/g/b.ts', 'src/g/c.ts']; // same dir ⇒ one cluster (600 bytes > 250)
    const clusters = clustersOf(files);
    expect(clusters.length).toBe(1);
    const r = binpackClusters(clusters, diffsOf({ 'src/g/a.ts': 200, 'src/g/b.ts': 200, 'src/g/c.ts': 200 }), 250);
    expect(r.splitClusterMarkers.length).toBe(1);
    expect(r.splitClusterMarkers[0]?.subChunkIds.length).toBeGreaterThanOrEqual(2);
    expect(r.splitClusterMarkers[0]?.coverageCaveat.length).toBeGreaterThan(0);
    expect(r.chunks.every((c) => c.renderedBytes <= 250)).toBe(true);
    expect(r.chunks.filter((c) => c.splitCluster).length).toBeGreaterThanOrEqual(2);
    expect(r.chunks.flatMap((c) => [...c.files]).sort()).toEqual([...files].sort());
  });

  it('fails loud when a single file alone exceeds the envelope (a-priori-broken)', () => {
    const files = ['src/huge.ts'];
    expect(() => binpackClusters(clustersOf(files), diffsOf({ 'src/huge.ts': 500 }), 250)).toThrow(/src\/huge\.ts/);
  });
});
