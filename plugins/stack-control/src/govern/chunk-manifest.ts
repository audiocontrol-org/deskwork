// 030 — per-chunk manifest of the OTHER chunks' file lists ("what this chunk
// cannot see"), so an auditor can flag a dependency it cannot see (FR-005, R8).
// File lists only — no diff bodies (envelope discipline). Phase 1 stub (T002);
// implemented in Phase 5 (T040).

import type { Chunk, ChunkManifest } from './chunk-artifacts.js';

/** Build each chunk's manifest of the other chunks' file lists (complete, no self-entry). */
export function buildChunkManifests(_chunks: readonly Chunk[]): readonly ChunkManifest[] {
  throw new Error('not implemented (030 chunk-manifest stub — Phase 5 T040)');
}
