// 030 cluster-payload — group coupled files into disjoint clusters from the
// coupling graph (data-model § Cluster). Every changed file lands in exactly
// one cluster. Phase 1 stub (T001); implemented in Phase 3 (T017).

import type { CouplingEdge, CouplingGraph } from './coupling-graph.js';

/** A coupling-derived group of files that bin-packs into chunks. Transient (not persisted). */
export interface Cluster {
  readonly memberFiles: readonly string[];
  readonly couplingEdges: readonly CouplingEdge[];
}

/** Group coupled files into disjoint clusters (every changed file in exactly one cluster). */
export function clusterFiles(_graph: CouplingGraph): Cluster[] {
  throw new Error('not implemented (030 clustering stub — Phase 3 T017)');
}
