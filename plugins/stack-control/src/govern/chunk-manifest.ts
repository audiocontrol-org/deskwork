// 030 — per-chunk manifest of the OTHER chunks' file lists ("what this chunk
// cannot see"), so an auditor can flag a dependency it cannot see (FR-005, R8).
// File lists only — no diff bodies (envelope discipline). Implemented in Phase 5
// (T040); used by the US1 aggregate (T020).

import type { Chunk, ChunkManifest } from './chunk-artifacts.js';

/** Build each chunk's manifest of the other chunks' file lists (complete, no self-entry). */
export function buildChunkManifests(chunks: readonly Chunk[]): readonly ChunkManifest[] {
  return chunks.map((chunk) => ({
    chunkId: chunk.id,
    otherChunks: chunks
      .filter((o) => o.id !== chunk.id)
      .map((o) => ({ id: o.id, files: [...o.files] })),
  }));
}
