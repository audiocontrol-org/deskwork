// 030 cluster-payload — render-aware verification post-pass (FR-027, T078). The
// bin-pack sizes on raw diff bytes; this pass measures each chunk's actual
// RENDERED body (chunk header + manifest of the other chunks' file lists + the
// per-file framing + audited diffs — everything EXCEPT the elastic shared
// preamble, which `renderChunkPayload` truncates at audit time) and guarantees it
// fits the envelope. A file whose own diff cannot render within the envelope even
// alone (under the raw-oversized FATAL threshold, but over-rendered) is excluded
// to coverage-only — its path stays in the chunk (coverage preserved, FR-028),
// its bytes withheld from the render — so NO chunk renders over-envelope (SC-009).

import type { Chunk, ChunkManifest } from '../chunk-artifacts.js';
import { renderChunkPayload } from '../payload-chunk.js';

/** Rendered BODY bytes (no preamble) — the envelope-fitting part the partition controls. */
function bodyBytes(chunk: Chunk, manifest: ChunkManifest, fileDiffs: ReadonlyMap<string, string>): number {
  // planContext = '' and renderBudgetBytes unset ⇒ measures the body verbatim, no truncation.
  return Buffer.byteLength(renderChunkPayload({ chunk, manifest, fileDiffs, planContext: '' }));
}

/** A chunk's current coverage-only set as a mutable Set. */
function coverageSet(chunk: Chunk): Set<string> {
  return new Set(chunk.coverageOnlyFiles ?? []);
}

/**
 * Make one chunk's rendered body fit `envelopeBytes`, excluding its largest-diff
 * audited files to coverage-only until it fits (FR-027/FR-028). Sets
 * `renderBudgetBytes` so the preamble is truncated at audit time. Returns the
 * fitted chunk (byte-identical when it already fits, plus the budget marker).
 */
function fitChunk(
  chunk: Chunk,
  manifest: ChunkManifest,
  fileDiffs: ReadonlyMap<string, string>,
  envelopeBytes: number,
): Chunk {
  const coverage = coverageSet(chunk);
  let current: Chunk = { ...chunk, coverageOnlyFiles: chunk.coverageOnlyFiles, renderBudgetBytes: envelopeBytes };

  // Candidate audited files, largest diff first (deterministic tiebreak by path),
  // so excluding the heaviest content first minimizes how many files are withheld.
  const auditedBySize = chunk.files
    .filter((f) => coverage.has(f) === false)
    .map((f) => ({ f, n: (fileDiffs.get(f) ?? '').length }))
    .sort((a, b) => b.n - a.n || a.f.localeCompare(b.f));

  for (const { f } of auditedBySize) {
    if (bodyBytes(current, manifest, fileDiffs) <= envelopeBytes) break;
    coverage.add(f);
    const cov = [...coverage].sort();
    current = { ...chunk, renderBudgetBytes: envelopeBytes, ...(cov.length > 0 ? { coverageOnlyFiles: cov } : {}) };
  }

  const fittedBytes = bodyBytes(current, manifest, fileDiffs);
  // AUDIT-20260622-11: postcondition (FR-027/SC-009) — NO chunk renders
  // over-envelope. The elastic context (preamble + other-chunks manifest) already
  // truncates to fit; withholding every audited diff to coverage-only removes the
  // remaining elastic body. So if the chunk STILL renders over-envelope here, its
  // IRREDUCIBLE framing — the chunk header + the files-in-scope list itself —
  // exceeds the envelope: a genuinely unfittable chunk (too many files / too-long
  // paths in one chunk). Returning it anyway would mark a false "fitted" record
  // and run the barrage on an oversized payload. Fail loud naming the chunk.
  if (fittedBytes > envelopeBytes) {
    throw new Error(
      `govern: FATAL — chunk '${chunk.id}' renders ${fittedBytes} bytes after truncating all elastic ` +
        `context and withholding every audited diff to coverage-only, still exceeding the fleet envelope ` +
        `${envelopeBytes}. The irreducible framing (chunk header + the ${chunk.files.length}-file in-scope ` +
        `list) does not fit. The cluster must sub-split into fewer files per chunk, or the envelope is too ` +
        `small — govern does not run the barrage on an over-envelope payload (FR-027/SC-009).`,
    );
  }
  return { ...current, renderedBytes: fittedBytes };
}

/**
 * Verify every chunk's rendered body fits the envelope; sub-fit any that don't.
 * Manifests are a pure function of chunk ids + `files` (which this pass never
 * changes — only `coverageOnlyFiles`), so they remain valid and stable.
 */
export function fitRenderedChunks(
  chunks: readonly Chunk[],
  manifests: readonly ChunkManifest[],
  fileDiffs: ReadonlyMap<string, string>,
  envelopeBytes: number,
): readonly Chunk[] {
  const manifestById = new Map(manifests.map((m) => [m.chunkId, m]));
  return chunks.map((chunk) => {
    const manifest = manifestById.get(chunk.id) ?? { chunkId: chunk.id, otherChunks: [] };
    return fitChunk(chunk, manifest, fileDiffs, envelopeBytes);
  });
}
