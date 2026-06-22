// 030 T022 (RED first) — FR-005: a chunk's audit payload renders its own diff
// plus the plan/spec/contracts context and the manifest of the OTHER chunks'
// file lists. Watched to FAIL while renderChunkPayload is a 'not implemented'
// stub.

import { describe, expect, it } from 'vitest';
import { renderChunkPayload, type ChunkPayloadInput } from '../../govern/payload-chunk.js';

const input: ChunkPayloadInput = {
  chunk: { id: 'c1', files: ['src/a.ts'], splitCluster: false, renderedBytes: 30 },
  manifest: { chunkId: 'c1', otherChunks: [{ id: 'c2', files: ['src/b.ts'] }] },
  fileDiffs: new Map<string, string>([['src/a.ts', '+export const x = 1;']]),
  planContext: 'PLAN-CONTEXT: implement the thing',
};

describe('030 T022 — payload-chunk (FR-005)', () => {
  it('renders the chunk diff, its files, the plan context, and the manifest', () => {
    const p = renderChunkPayload(input);
    expect(p).toContain('+export const x = 1;'); // the chunk's own diff
    expect(p).toContain('src/a.ts'); // the chunk's file
    expect(p).toContain('PLAN-CONTEXT: implement the thing'); // shared plan/spec/contracts context
    expect(p).toContain('src/b.ts'); // the OTHER chunk's file list (manifest)
  });

  it('renders a measurable, non-empty payload string', () => {
    const p = renderChunkPayload(input);
    expect(Buffer.byteLength(p)).toBeGreaterThan(0);
  });
});
