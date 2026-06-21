// 030 cluster-payload — deterministic stable chunk id (FR-004, R3). The id is a
// stable hash of the chunk's sorted file-path set, pinned to the
// governedSha..HEAD endpoints, so re-running the partitioner over identical
// endpoints yields identical ids. Phase 1 stub (T001); implemented in Phase 2
// (T007).

/** Compute the deterministic stable id for a chunk from its file set. */
export function computeChunkId(_files: readonly string[]): string {
  throw new Error('not implemented (030 chunk-id stub — Phase 2 T007)');
}
