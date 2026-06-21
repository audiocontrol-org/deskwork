// 030 — render ONE chunk's audit payload: the chunk's diff + the plan/spec/
// contracts context + the chunk's manifest of the other chunks' file lists
// (FR-005). The rendered payload stays within the active fleet envelope. A
// payload-implement.ts successor (FR-022/FR-023). Phase 1 stub (T002);
// implemented in Phase 3 (T022).

import type { Chunk, ChunkManifest } from './chunk-artifacts.js';

/** Inputs to rendering a single chunk's audit payload. */
export interface ChunkPayloadInput {
  readonly chunk: Chunk;
  readonly manifest: ChunkManifest;
  readonly fileDiffs: ReadonlyMap<string, string>;
  /** The plan/spec/contracts context block shared across chunks. */
  readonly planContext: string;
}

/** Render one chunk's audit payload (diff + plan/spec/contracts + manifest). */
export function renderChunkPayload(_input: ChunkPayloadInput): string {
  throw new Error('not implemented (030 payload-chunk stub — Phase 3 T022)');
}
