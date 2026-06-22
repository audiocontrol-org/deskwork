// 030 cluster-payload — deterministic stable chunk id (FR-004, R3). The id is a
// stable hash of the chunk's sorted, de-duplicated file-path set, so re-running
// the partitioner over identical governedSha..HEAD endpoints (hence identical
// changed-file sets) yields identical ids. Set semantics: order and duplicates
// do not change the id. Implemented in Phase 2 (T007).

import { createHash } from 'node:crypto';

/** Length of the truncated hex digest used as the chunk id (collision-safe within a feature). */
const CHUNK_ID_HEX_LENGTH = 16;

/** Compute the deterministic stable id for a chunk from its file set. */
export function computeChunkId(files: readonly string[]): string {
  const canonical = Array.from(new Set(files)).sort();
  return createHash('sha256').update(canonical.join('\n')).digest('hex').slice(0, CHUNK_ID_HEX_LENGTH);
}
