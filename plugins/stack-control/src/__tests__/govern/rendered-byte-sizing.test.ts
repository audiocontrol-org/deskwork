// 030 T071 (RED first) — FR-027 / SC-009: a chunk whose RAW diff bytes are ≤ the
// envelope but whose RENDERED payload (plan/spec/contracts preamble + chunk
// header + per-file framing + the FR-021/FR-005 manifest of the OTHER chunks'
// file lists) is > the envelope MUST be split so that NO chunk renders
// over-envelope. The current sizing bug measures RAW diff bytes (envelope-binpack
// `bytesOf` / `Chunk.renderedBytes = bin.bytes`), NOT the rendered payload — so an
// under-raw-but-over-rendered chunk slips through as a single over-envelope chunk.
//
// This test FAILS today because partition sizes on raw bytes: at least one chunk's
// renderChunkPayload(...) byte length exceeds the envelope. It must pass once
// sizing measures the RENDERED payload (the T078 fix — NOT implemented here).

import { describe, expect, it } from 'vitest';
import { partitionDiff, type PartitionInput } from '../../govern/cluster-payload/partition.js';
import { renderChunkPayload } from '../../govern/payload-chunk.js';

const ENVELOPE = 300;

// A realistic plan/spec/contracts preamble shared across every rendered chunk.
// This is the ever-present rendered overhead that raw-byte sizing ignores.
const PLAN_CONTEXT =
  'PLAN/SPEC/CONTRACTS CONTEXT (shared across all chunks):\n' +
  'p'.repeat(220);

// Two singleton files in DISTINCT directories whose diffs do NOT cross-reference,
// so each becomes its own cluster ⇒ its own chunk (and each chunk's manifest then
// lists the OTHER chunk's files — more rendered overhead raw sizing ignores).
// Each file's RAW diff is 240 bytes (< 300 envelope), so raw-byte sizing happily
// emits each as a single chunk. But PLAN_CONTEXT (~280B) + framing pushes the
// RENDERED payload of each chunk well over 300.
function buildInput(): PartitionInput {
  const fileDiffs = new Map<string, string>([
    ['alpha/one.ts', `+${'a'.repeat(239)}`],
    ['bravo/two.ts', `+${'b'.repeat(239)}`],
  ]);
  return { changedFiles: ['alpha/one.ts', 'bravo/two.ts'], fileDiffs };
}

describe('030 T071 — rendered-byte sizing (FR-027 / SC-009)', () => {
  it('sanity: every chunk is within the envelope by RAW bytes (the input the bug accepts)', () => {
    const input = buildInput();
    const { chunks } = partitionDiff(input, ENVELOPE);
    // Each file's raw diff is 240 bytes < 300; raw-byte sizing keeps them whole.
    for (const c of chunks) {
      const raw = c.files.reduce((s, f) => s + (input.fileDiffs.get(f) ?? '').length, 0);
      expect(raw).toBeLessThanOrEqual(ENVELOPE);
    }
  });

  it('every chunk renders within the envelope (rendered bytes ≤ envelope)', () => {
    const input = buildInput();
    const { chunks, manifests } = partitionDiff(input, ENVELOPE);

    for (const chunk of chunks) {
      const manifest = manifests.find((m) => m.chunkId === chunk.id);
      expect(manifest).toBeDefined();
      if (manifest === undefined) continue;
      const rendered = renderChunkPayload({
        chunk,
        manifest,
        fileDiffs: input.fileDiffs,
        planContext: PLAN_CONTEXT,
      });
      const renderedBytes = Buffer.byteLength(rendered);
      // Operator-perceivable, behavioral contract: no chunk renders over-envelope.
      // FAILS today — partition sizes on RAW diff bytes, ignoring the rendered
      // preamble + per-file framing + manifest, so this chunk renders too large.
      expect(
        renderedBytes,
        `chunk ${chunk.id} (files: ${[...chunk.files].join(', ')}) renders ${renderedBytes} bytes, exceeding the ${ENVELOPE}-byte envelope`,
      ).toBeLessThanOrEqual(ENVELOPE);
    }
  });
});
