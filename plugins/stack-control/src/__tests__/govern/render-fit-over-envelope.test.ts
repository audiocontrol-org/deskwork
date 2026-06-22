// 030 cluster-payload — AUDIT-20260622-11 (RED first). `fitChunk` excludes audited
// files into coverage-only until the rendered body fits the envelope, but when the
// chunk still renders over-envelope after every elastic part is gone, the loop
// exhausted its candidates and returned `{ ...current, renderedBytes: fittedBytes }`
// WITHOUT checking the postcondition — a silently over-envelope chunk that breaks
// FR-027/SC-009 (no chunk renders over-envelope). The elastic context (preamble +
// other-chunks manifest) truncates to fit; the only irreducible part is the chunk's
// framing — the header + the files-in-scope LIST. A chunk whose file list alone
// exceeds the envelope cannot fit; the fix asserts the invariant and FAILS LOUD
// naming the chunk. Watched to FAIL while the postcondition is absent.

import { describe, expect, it } from 'vitest';
import { fitRenderedChunks } from '../../govern/cluster-payload/render-fit.js';
import { renderedByteLength } from '../../govern/payload-chunk.js';
import type { Chunk, ChunkManifest } from '../../govern/chunk-artifacts.js';

describe('030 AUDIT-20260622-11 — render-fit cannot return an over-envelope chunk', () => {
  const envelope = 120;

  it('fails loud when the irreducible framing (header + file list) exceeds the envelope', () => {
    // Many files in ONE chunk → the "Files in scope: f1, f2, …" header alone exceeds
    // the envelope. Withholding every diff to coverage-only cannot shrink the header,
    // and the manifest is elastic context that truncates — so the chunk is genuinely
    // unfittable and must fail loud rather than render over-envelope.
    const files = Array.from({ length: 12 }, (_, i) => `src/dir/long-file-name-${i}.ts`);
    const chunk: Chunk = { id: 'c1', files, splitCluster: false, renderedBytes: 0 };
    const fileDiffs = new Map(files.map((f) => [f, 'x'.repeat(20)]));
    const manifest: ChunkManifest = { chunkId: 'c1', otherChunks: [] };
    expect(() => fitRenderedChunks([chunk], [manifest], fileDiffs, envelope)).toThrow(/c1/);
    expect(() => fitRenderedChunks([chunk], [manifest], fileDiffs, envelope)).toThrow(/envelope/i);
  });

  it('truncates a large manifest (elastic context) to fit rather than failing loud', () => {
    // A small chunk with a HUGE other-chunks manifest: the manifest is elastic and
    // must truncate to fit — NOT trigger the irreducible-framing fail-loud.
    const chunk: Chunk = { id: 'c2', files: ['a.ts'], splitCluster: false, renderedBytes: 0 };
    const diffs = new Map<string, string>([['a.ts', 'y'.repeat(20)]]);
    const bigManifest: ChunkManifest = {
      chunkId: 'c2',
      otherChunks: Array.from({ length: 20 }, (_, i) => ({
        id: `other-${i}`,
        files: [`some/deep/path/to/file-${i}-with-a-long-name.ts`, `another/long/path/sibling-${i}.ts`],
      })),
    };
    const [fitted] = fitRenderedChunks([chunk], [bigManifest], diffs, envelope);
    // fitChunk does NOT mutate or return manifests — `bigManifest` is unchanged. The
    // manifest truncation is RENDER-TIME: fitRenderedChunks marks the chunk with a
    // `renderBudgetBytes`, and renderChunkPayload then truncates the elastic context
    // (preamble + this manifest) to that budget. Pass the ORIGINAL bigManifest on
    // purpose — the render path is what must keep it within the envelope (AUDIT-20260622-21).
    expect(bigManifest.otherChunks.length).toBe(20); // not mutated by fitRenderedChunks
    expect(fitted.renderBudgetBytes).toBe(envelope); // the chunk carries the render budget
    const rendered = renderedByteLength({ chunk: fitted, manifest: bigManifest, fileDiffs: diffs, planContext: '' });
    expect(rendered).toBeLessThanOrEqual(envelope);
  });

  it('still fits a chunk whose audited diff CAN be withheld to fit (no false fail-loud)', () => {
    const fittable: Chunk = { id: 'c3', files: ['big.ts'], splitCluster: false, renderedBytes: 0 };
    const diffs = new Map<string, string>([['big.ts', 'y'.repeat(500)]]);
    const emptyManifest: ChunkManifest = { chunkId: 'c3', otherChunks: [] };
    const [fitted] = fitRenderedChunks([fittable], [emptyManifest], diffs, envelope);
    const rendered = renderedByteLength({ chunk: fitted, manifest: emptyManifest, fileDiffs: diffs, planContext: '' });
    expect(rendered).toBeLessThanOrEqual(envelope);
  });
});
