// Inbox mutations (007). Every mutation computes a CANDIDATE document in memory,
// re-validates the whole governed design-inbox document (identifier uniqueness,
// order-key domain) via loadDocumentFromSource, and only then writes — a
// validation failure leaves the on-disk document byte-for-byte unchanged
// (FR-003 zero-write). Dry-run (apply=false) returns the candidate without
// writing. Mirrors src/roadmap/mutations.ts (research D1/D3); reuses the
// document-primitives engine + the design-inbox grammar unchanged.

import { writeFileSync } from 'node:fs';
import {
  loadDocument,
  loadDocumentFromSource,
  type LoadOptions,
} from '../document-model/document.js';
import { DocumentModelError } from '../document-model/types.js';

export interface MutationResult {
  readonly applied: boolean;
  /** The candidate document source (the new content, applied or dry-run). */
  readonly source: string;
}

/** One-move capture input; only title + idea are required (FR-002). */
export interface CaptureInput {
  readonly title: string;
  readonly idea: string;
  readonly surfaced?: string;
  readonly context?: string;
  readonly home?: string;
}

/**
 * Re-validate a candidate document against its grammar + graph, then write it
 * iff `apply`. A validation failure throws `DocumentModelError` *before* any
 * write (zero-write); on success and dry-run, the candidate is returned but not
 * written. The single fail-safe substrate every inbox mutation commits through.
 */
export function commit(
  docPath: string,
  candidate: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  loadDocumentFromSource(candidate, docPath, opts);
  if (apply) writeFileSync(docPath, candidate, 'utf8');
  return { applied: apply, source: candidate };
}

/** The `### <title>` section for a new captured entry (Status bullet last,
 * matching the governed inbox's convention). Optional fields are omitted when
 * absent so capture stays one-move (FR-002). */
function buildCaptureSection(input: CaptureInput): string[] {
  const lines = [`### ${input.title.trim()}`];
  if (input.surfaced !== undefined) lines.push(`- **Surfaced:** ${input.surfaced}`);
  if (input.context !== undefined) lines.push(`- **Context:** ${input.context}`);
  lines.push(`- **Idea:** ${input.idea.trim()}`);
  if (input.home !== undefined) lines.push(`- **Provisional home:** ${input.home}`);
  lines.push('- **Status:** **captured**');
  return lines;
}

/**
 * Capture a new idea in one move (FR-001) — append a `captured` entry after the
 * last unit, then re-validate the whole governed inbox via `commit` (a duplicate
 * identifier / structural violation throws before any write — FR-003 zero-write).
 * Mirrors roadmap/mutations.ts:add (append-then-revalidate). Title and idea are
 * required and non-empty (Principle V fail-loud; no empty entry recorded).
 */
export function capture(
  docPath: string,
  input: CaptureInput,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  if (input.title.trim().length === 0) {
    throw new DocumentModelError('capture requires a non-empty <title>');
  }
  if (input.idea.trim().length === 0) {
    throw new DocumentModelError('capture requires a non-empty --idea');
  }
  const { doc } = loadDocument(docPath, opts);
  const sourceLines = doc.sourceLines;
  const insertAt =
    doc.units.length > 0 ? doc.units[doc.units.length - 1]!.span.endLine : sourceLines.length;
  const before = sourceLines.slice(0, insertAt);
  const after = sourceLines.slice(insertAt);
  const section = buildCaptureSection(input);
  // Exactly one blank line on each side of the new section, never doubling an
  // already-blank edge (mirrors roadmap add — keeps repeated captures tidy).
  const preBlank = before.length > 0 && before[before.length - 1]!.trim() !== '' ? [''] : [];
  const postBlank = after.length > 0 && after[0]!.trim() !== '' ? [''] : [];
  const candidate = [...before, ...preBlank, ...section, ...postBlank, ...after].join('\n');
  return commit(docPath, candidate, opts, apply);
}
