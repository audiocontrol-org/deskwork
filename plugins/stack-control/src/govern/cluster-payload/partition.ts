// 030 cluster-payload — the deterministic aggregate entry point: couple →
// cluster → bin-pack (with trim + oversized sub-split) → manifest, producing the
// envelope-sized chunk set for the whole committed diff (FR-002/FR-003/FR-004,
// contracts/cluster-payload.md). Pure + deterministic: identical input ⇒
// byte-identical output. Implemented in Phase 3 (T020).

import type { Chunk, ChunkManifest, SplitClusterMarker } from '../chunk-artifacts.js';
import { buildChunkManifests } from '../chunk-manifest.js';
import { buildCouplingGraph, type CouplingEdge } from './coupling-graph.js';
import { clusterFiles } from './clustering.js';
import { binpackClusters } from './envelope-binpack.js';

/** Inputs to partitioning the whole committed diff into an envelope-sized chunk set. */
export interface PartitionInput {
  readonly changedFiles: readonly string[];
  readonly fileDiffs: ReadonlyMap<string, string>;
  /** TS import edges, when the precision layer is available (capability-gated). */
  readonly tsImportEdges?: readonly CouplingEdge[];
}

/** The deterministic, ordered chunk set (contracts/cluster-payload.md output). */
export interface PartitionResult {
  readonly chunks: readonly Chunk[];
  readonly chunkIds: readonly string[];
  readonly manifests: readonly ChunkManifest[];
  readonly splitClusterMarkers: readonly SplitClusterMarker[];
}

/** Partition the committed diff into a deterministic envelope-sized chunk set. */
export function partitionDiff(input: PartitionInput, envelopeBytes: number): PartitionResult {
  const graph = buildCouplingGraph({
    changedFiles: input.changedFiles,
    fileDiffs: input.fileDiffs,
    tsImportEdges: input.tsImportEdges,
  });
  const clusters = clusterFiles(graph);
  const { chunks, splitClusterMarkers } = binpackClusters(clusters, input.fileDiffs, envelopeBytes);
  const manifests = buildChunkManifests(chunks);
  return { chunks, chunkIds: chunks.map((c) => c.id), manifests, splitClusterMarkers };
}
