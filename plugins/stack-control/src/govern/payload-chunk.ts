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

/** Marker appended when the shared preamble is truncated to fit the chunk's render budget (FR-027). */
const PREAMBLE_TRUNCATION_MARKER = '\n…[plan/spec/contracts context truncated to fit the fleet envelope]';

/**
 * Render the chunk's non-preamble body: the chunk header, the manifest of the
 * OTHER chunks' file lists, and the AUDITED diffs (coverage-only files keep their
 * path in the header but contribute no diff bytes — FR-028 / FR-006).
 */
function renderBody(input: ChunkPayloadInput): string {
  const parts: string[] = [`\n## Chunk ${input.chunk.id}\nFiles in scope: ${[...input.chunk.files].join(', ')}`];

  if (input.manifest.otherChunks.length > 0) {
    parts.push('\n## Other chunks (file lists only — context for cross-file dependencies this chunk cannot see):');
    for (const o of input.manifest.otherChunks) {
      parts.push(`- ${o.id}: ${[...o.files].join(', ')}`);
    }
  }

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
 * Truncate the shared preamble so `preamble + "\n" + body` fits `budgetBytes`.
 * The body (framing + manifest + audited diffs) is the partition-guaranteed
 * envelope-fitting part and is NEVER truncated; only the elastic preamble is.
 */
function fitPreamble(planContext: string, body: string, budgetBytes: number): string {
  const joinByte = 1; // the '\n' between preamble and body
  const available = budgetBytes - Buffer.byteLength(body) - joinByte;
  if (Buffer.byteLength(planContext) <= available) return planContext;
  if (available <= Buffer.byteLength(PREAMBLE_TRUNCATION_MARKER)) {
    // No room for any preamble content beyond the marker (or none at all): drop it.
    return available <= 0 ? '' : PREAMBLE_TRUNCATION_MARKER.slice(0, available);
  }
  const keep = available - Buffer.byteLength(PREAMBLE_TRUNCATION_MARKER);
  return `${planContext.slice(0, keep)}${PREAMBLE_TRUNCATION_MARKER}`;
}

/** Render one chunk's audit payload (diff + plan/spec/contracts + manifest). */
export function renderChunkPayload(input: ChunkPayloadInput): string {
  const body = renderBody(input);
  // No render budget set (e.g. a hand-constructed chunk) ⇒ full preamble, no
  // truncation — preserves the FR-005 "include the full context" default.
  const budget = input.chunk.renderBudgetBytes;
  const preamble = budget === undefined ? input.planContext : fitPreamble(input.planContext, body, budget);
  return `${preamble}\n${body}`;
}

/**
 * The exact rendered byte length of a chunk's payload — the envelope currency
 * (FR-027). This is the source of truth the partition's verification pass measures
 * against, so no chunk renders over-envelope regardless of manifest growth.
 */
export function renderedByteLength(input: ChunkPayloadInput): number {
  return Buffer.byteLength(renderChunkPayload(input));
}
