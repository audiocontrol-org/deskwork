// 030 cluster-payload — bin-pack clusters into chunks each within the active
// fleet envelope (FR-002), sub-splitting an oversized single cluster (after the
// non-audit trim pre-pass) into envelope-sized sub-chunks with a
// SplitClusterMarker (FR-006). NEVER throws boundary-too-large — the packer
// AVOIDS the condition. Phase 1 stub (T001); implemented in Phase 3 (T019).

import type { Chunk, SplitClusterMarker } from '../chunk-artifacts.js';
import type { Cluster } from './clustering.js';

/** The bin-pack outcome: the envelope-sized chunk set + any split-cluster markers. */
export interface BinPackResult {
  readonly chunks: readonly Chunk[];
  readonly splitClusterMarkers: readonly SplitClusterMarker[];
}

/** Pack clusters into chunks ≤ envelope (first-fit-decreasing); sub-split an oversized cluster. */
export function binpackClusters(_clusters: readonly Cluster[], _envelopeBytes: number): BinPackResult {
  throw new Error('not implemented (030 envelope-binpack stub — Phase 3 T019)');
}
