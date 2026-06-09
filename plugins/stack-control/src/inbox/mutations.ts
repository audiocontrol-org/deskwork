// Inbox mutations (007). Every mutation computes a CANDIDATE document in memory,
// re-validates the whole governed design-inbox document (identifier uniqueness,
// order-key domain) via loadDocumentFromSource, and only then writes — a
// validation failure leaves the on-disk document byte-for-byte unchanged
// (FR-003 zero-write). Dry-run (apply=false) returns the candidate without
// writing. Mirrors src/roadmap/mutations.ts (research D1/D3); reuses the
// document-primitives engine + the design-inbox grammar unchanged.

import { loadDocument, type LoadOptions } from '../document-model/document.js';
import {
  commitCandidate,
  findUnit,
  lineInUnit,
  spliceWithBlankLines,
  type MutationResult,
} from '../document-model/mutations-core.js';
import { DocumentModelError, type GovernableDocument, type Unit } from '../document-model/types.js';

// Re-export the shared result type so callers can keep importing it from here.
export type { MutationResult } from '../document-model/mutations-core.js';
// Re-export the shared validate-and-commit helper under its inbox-local name.
export { commitCandidate as commit } from '../document-model/mutations-core.js';

// The design-inbox status bullet is grammar-specific: `- **Status:** **<s>**`
// (NOT roadmap's `- status:`). Locate it to rewrite in place (research D3).
const INBOX_STATUS_LINE = /\*\*Status:\*\*/i;

/** One-move capture input; only title + idea are required (FR-002). */
export interface CaptureInput {
  readonly title: string;
  readonly idea: string;
  readonly surfaced?: string;
  readonly context?: string;
  readonly home?: string;
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
  const candidate = spliceWithBlankLines(
    sourceLines.slice(0, insertAt),
    buildCaptureSection(input),
    sourceLines.slice(insertAt),
  );
  return commitCandidate(docPath, candidate, opts, apply);
}

/** Find an inbox entry by identifier, failing loud when absent (Principle V). */
function requireEntry(doc: GovernableDocument, identifier: string): Unit {
  const unit = findUnit(doc, identifier);
  if (unit === undefined) throw new DocumentModelError(`inbox has no entry '${identifier}'`);
  return unit;
}

/**
 * Shared triage transition (advance-style; research D3): rewrite a captured
 * entry's `**Status:**` bullet to `toStatus` and append a recorded body line
 * (the target reference for promote, the reason for drop), then re-validate the
 * whole doc and write atomically. Refuses (zero-write) when the entry is absent
 * or already terminal — promote/drop are only valid from `captured`.
 */
function transition(
  docPath: string,
  identifier: string,
  toStatus: string,
  recordLine: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  const unit = requireEntry(doc, identifier);
  if (doc.grammar.terminalStatuses.includes(unit.status)) {
    throw new DocumentModelError(
      `entry '${identifier}' is already terminal (${unit.status}); promote/drop are only valid from 'captured'`,
    );
  }
  const lines = [...doc.sourceLines];
  const idx = lineInUnit(lines, unit, INBOX_STATUS_LINE);
  if (idx < 0) throw new DocumentModelError(`entry '${identifier}' has no status line to rewrite`);
  lines[idx] = `- **Status:** **${toStatus}**`;
  lines.splice(idx + 1, 0, recordLine);
  return commitCandidate(docPath, lines.join('\n'), opts, apply);
}

/**
 * Promote a captured entry (FR-007/FR-014): status → `promoted`, recording the
 * graduation target reference. RECORD-AND-REUSE — the target is recorded only,
 * NOT validated against or created here (creation is a separate `roadmap add` /
 * issue / spec step). The ref may reference anything; it need not exist.
 */
export function promote(
  docPath: string,
  identifier: string,
  target: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  if (target.trim().length === 0) {
    throw new DocumentModelError('promote requires a non-empty --to <ref>');
  }
  return transition(docPath, identifier, 'promoted', `- **Promoted-to:** ${target.trim()}`, opts, apply);
}

/** Drop a captured entry (FR-007): status → `dropped`, recording the reason. */
export function drop(
  docPath: string,
  identifier: string,
  reason: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  if (reason.trim().length === 0) {
    throw new DocumentModelError('drop requires a non-empty --reason');
  }
  return transition(docPath, identifier, 'dropped', `- **Drop-reason:** ${reason.trim()}`, opts, apply);
}
