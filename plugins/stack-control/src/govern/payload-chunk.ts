// 030 — render ONE chunk's audit payload: the chunk's diff + the plan/spec/
// contracts context + the chunk's manifest of the other chunks' file lists
// (FR-005). A payload-implement.ts successor (FR-022/FR-023). Implemented in
// Phase 3 (T022).

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
export function renderChunkPayload(input: ChunkPayloadInput): string {
  const parts: string[] = [input.planContext, `\n## Chunk ${input.chunk.id}\nFiles in scope: ${[...input.chunk.files].join(', ')}`];

  if (input.manifest.otherChunks.length > 0) {
    parts.push('\n## Other chunks (file lists only — context for cross-file dependencies this chunk cannot see):');
    for (const o of input.manifest.otherChunks) {
      parts.push(`- ${o.id}: ${[...o.files].join(', ')}`);
    }
  }

  parts.push('\n## Diffs');
  for (const f of input.chunk.files) {
    parts.push(`\n### ${f}\n${input.fileDiffs.get(f) ?? ''}`);
  }

  return parts.join('\n');
}
