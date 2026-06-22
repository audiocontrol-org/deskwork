// 030 T011 (RED first) — data-model § Cluster: coupled files group into clusters
// (connected components of the coupling graph); every changed file lands in
// exactly one cluster; clusters are disjoint. Watched to FAIL while clusterFiles
// is a 'not implemented' stub (Phase 3 T017 makes it pass).

import { describe, expect, it } from 'vitest';
import { clusterFiles } from '../../govern/cluster-payload/clustering.js';
import { buildCouplingGraph } from '../../govern/cluster-payload/coupling-graph.js';

/** Get-or-throw — the project bans `!` non-null assertions ("Never bypass typing"). */
function defined<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('expected a defined value');
  return v;
}

describe('030 T011 — clustering (data-model Cluster)', () => {
  it('groups directly-coupled files into the same cluster, isolated files separate', () => {
    // x,y share dir src/a (dir-coupled); z is alone in src/b.
    const g = buildCouplingGraph({ changedFiles: ['src/a/x.ts', 'src/a/y.ts', 'src/b/z.ts'] });
    const clusters = clusterFiles(g);
    const cx = defined(clusters.find((c) => c.memberFiles.includes('src/a/x.ts')));
    expect([...cx.memberFiles].sort()).toEqual(['src/a/x.ts', 'src/a/y.ts']);
    expect(defined(clusters.find((c) => c.memberFiles.includes('src/b/z.ts'))).memberFiles).toEqual(['src/b/z.ts']);
  });

  it('is a disjoint cover — every changed file in exactly one cluster', () => {
    const g = buildCouplingGraph({ changedFiles: ['src/a/x.ts', 'src/b/y.ts', 'src/c/z.ts'] });
    const clusters = clusterFiles(g);
    const all = clusters.flatMap((c) => [...c.memberFiles]).sort();
    expect(all).toEqual(['src/a/x.ts', 'src/b/y.ts', 'src/c/z.ts']);
    expect(all.length).toBe(new Set(all).size); // pairwise disjoint
    expect(clusters.length).toBe(3); // no coupling ⇒ three singletons
  });

  it('merges transitively-coupled files (a→b, b→c) into one cluster', () => {
    const g = buildCouplingGraph({
      changedFiles: ['src/a/a.ts', 'src/b/b.ts', 'src/c/c.ts'],
      fileDiffs: new Map<string, string>([
        ['src/a/a.ts', 'import "../b/b.js"'],
        ['src/b/b.ts', 'import "../c/c.js"'],
        ['src/c/c.ts', ''],
      ]),
    });
    const clusters = clusterFiles(g);
    expect(clusters.length).toBe(1);
    expect([...defined(clusters[0]).memberFiles].sort()).toEqual(['src/a/a.ts', 'src/b/b.ts', 'src/c/c.ts']);
  });
});
