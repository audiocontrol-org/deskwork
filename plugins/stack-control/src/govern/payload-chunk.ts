// 030 — render ONE chunk's audit payload: the chunk's diff + the plan/spec/
// contracts context + the chunk's manifest of the other chunks' file lists
// (FR-005). A payload-implement.ts successor (FR-022/FR-023). Implemented in
// Phase 3 (T022). T078 (FR-027): the render is the envelope currency — when the
// chunk carries a `renderBudgetBytes` the partition set, the shared (elastic,
// low-density) plan/spec/contracts preamble is truncated so the WHOLE rendered
// payload stays within that budget; the partition guarantees the non-preamble
// part (framing + manifest + audited diffs) already fits, so no chunk renders
// over-envelope (SC-009).

import type { Chunk, ChunkManifest } from './chunk-artifacts.js';

/** Inputs to rendering a single chunk's audit payload. */
export interface ChunkPayloadInput {
  readonly chunk: Chunk;
  readonly manifest: ChunkManifest;
  readonly fileDiffs: ReadonlyMap<string, string>;
  /** The plan/spec/contracts context block shared across chunks. */
  readonly planContext: string;
}

/** Marker appended when the elastic context is truncated to fit the chunk's render budget (FR-027). */
const CONTEXT_TRUNCATION_MARKER = '\n…[shared context truncated to fit the fleet envelope]';

/**
 * Render the chunk's LOAD-BEARING framing: the chunk header (id + the full
 * files-in-scope list) and the AUDITED diffs (coverage-only files keep their path
 * in the header but contribute no diff bytes — FR-028 / FR-006). This is the part
 * render-fit controls by withholding diffs to coverage-only; the header is its
 * irreducible floor. It is NEVER truncated by the budget — if it cannot fit even
 * after withholding every diff, render-fit fails loud (AUDIT-20260622-11).
 */
function renderFraming(input: ChunkPayloadInput): string {
  const parts: string[] = [`\n## Chunk ${input.chunk.id}\nFiles in scope: ${[...input.chunk.files].join(', ')}`];
  // FR-028 / FR-006: a coverage-only (non-audit-trimmed or un-auditable-within-
  // envelope) file keeps its PATH in `chunk.files` (union completeness) but its
  // diff BYTES are excluded from the rendered payload — coverage never dropped.
  const coverageOnly = new Set(input.chunk.coverageOnlyFiles ?? []);
  parts.push('\n## Diffs');
  for (const f of input.chunk.files) {
    if (coverageOnly.has(f)) continue;
    parts.push(`\n### ${f}\n${input.fileDiffs.get(f) ?? ''}`);
  }
  return parts.join('\n');
}

/**
 * Render the manifest of the OTHER chunks' file lists (FR-005) — cross-file
 * dependency CONTEXT this chunk cannot otherwise see. AUDIT-20260622-11: this is
 * elastic context (like the plan/spec preamble), NOT load-bearing, and grows with
 * the chunk count; it is truncated to fit the envelope rather than forcing an
 * over-envelope payload. Empty when there are no other chunks.
 */
function renderManifest(manifest: ChunkManifest): string {
  if (manifest.otherChunks.length === 0) return '';
  const parts: string[] = ['## Other chunks (file lists only — context for cross-file dependencies this chunk cannot see):'];
  for (const o of manifest.otherChunks) parts.push(`- ${o.id}: ${[...o.files].join(', ')}`);
  return parts.join('\n');
}

/**
 * Largest prefix of `s` whose UTF-8 byte length is ≤ `maxBytes`, never splitting a
 * multibyte character. Character-based `slice` is byte-inaccurate for multibyte
 * content (e.g. the manifest header's em-dash is 3 bytes / 1 char), which would
 * overshoot the envelope by up to 2 bytes per multibyte char in the cut region —
 * exactly the over-envelope leak this truncation exists to prevent.
 */
function sliceToBytes(s: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  if (Buffer.byteLength(s) <= maxBytes) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (Buffer.byteLength(s.slice(0, mid)) <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo);
}

/**
 * Truncate the elastic context (plan/spec/contracts preamble + the other-chunks
 * manifest) so `context + "\n" + framing` fits `budgetBytes`. The framing (header
 * + audited diffs) is the load-bearing part render-fit guarantees fits and is
 * NEVER truncated here; only the elastic context is. Truncation is byte-accurate
 * (UTF-8 safe) so the result never overshoots the envelope.
 */
function fitContext(context: string, framing: string, budgetBytes: number): string {
  const joinByte = 1; // the '\n' between context and framing
  const available = budgetBytes - Buffer.byteLength(framing) - joinByte;
  if (Buffer.byteLength(context) <= available) return context;
  const markerBytes = Buffer.byteLength(CONTEXT_TRUNCATION_MARKER);
  if (available <= markerBytes) {
    // No room for any context beyond the marker (or none at all): drop it.
    return sliceToBytes(CONTEXT_TRUNCATION_MARKER, available);
  }
  return `${sliceToBytes(context, available - markerBytes)}${CONTEXT_TRUNCATION_MARKER}`;
}

/** Render one chunk's audit payload (load-bearing framing + elastic plan/manifest context). */
export function renderChunkPayload(input: ChunkPayloadInput): string {
  const framing = renderFraming(input);
  const manifest = renderManifest(input.manifest);
  // Elastic, low-density context shared/duplicated across chunks: the plan/spec/
  // contracts preamble + the other-chunks manifest. Both truncate to fit (FR-005
  // default keeps them whole when no budget is set, e.g. a hand-constructed chunk).
  const context = manifest === '' ? input.planContext : `${input.planContext}\n${manifest}`;
  const budget = input.chunk.renderBudgetBytes;
  const fitted = budget === undefined ? context : fitContext(context, framing, budget);
  return `${fitted}\n${framing}`;
}

/**
 * The exact rendered byte length of a chunk's payload — the envelope currency
 * (FR-027). This is the source of truth the partition's verification pass measures
 * against, so no chunk renders over-envelope regardless of manifest growth.
 */
export function renderedByteLength(input: ChunkPayloadInput): number {
  return Buffer.byteLength(renderChunkPayload(input));
}
