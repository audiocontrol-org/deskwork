// 030 cluster-payload — group coupled files into disjoint clusters from the
// coupling graph (data-model § Cluster): clusters are the connected components
// of the coupling graph, so every changed file lands in exactly one cluster and
// transitively-coupled files merge. Implemented in Phase 3 (T017).

import type { CouplingEdge, CouplingGraph } from './coupling-graph.js';

/** A coupling-derived group of files that bin-packs into chunks. Transient (not persisted). */
export interface Cluster {
  readonly memberFiles: readonly string[];
  readonly couplingEdges: readonly CouplingEdge[];
}

/** Group coupled files into disjoint clusters (connected components; deterministic order). */
export function clusterFiles(graph: CouplingGraph): Cluster[] {
  const parent = new Map<string, string>();
  for (const f of graph.files) parent.set(f, f);

  function find(x: string): string {
    let root = x;
    for (;;) {
      const p = parent.get(root);
      if (p === undefined || p === root) break;
      root = p;
    }
    return root;
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const [lo, hi] = ra < rb ? [ra, rb] : [rb, ra]; // smaller id is the canonical root (deterministic)
    parent.set(hi, lo);
  }

  for (const e of graph.edges) {
    if (parent.has(e.from) && parent.has(e.to)) union(e.from, e.to);
  }

  const groups = new Map<string, string[]>();
  for (const f of graph.files) {
    const root = find(f);
    const arr = groups.get(root);
    if (arr === undefined) groups.set(root, [f]);
    else arr.push(f);
  }

  const clusters: Cluster[] = [];
  for (const members of groups.values()) {
    const memberSet = new Set(members);
    const memberFiles = [...members].sort();
    const couplingEdges = graph.edges.filter((e) => memberSet.has(e.from) && memberSet.has(e.to));
    clusters.push({ memberFiles, couplingEdges });
  }
  clusters.sort((a, b) => (a.memberFiles[0] ?? '').localeCompare(b.memberFiles[0] ?? ''));
  return clusters;
}
