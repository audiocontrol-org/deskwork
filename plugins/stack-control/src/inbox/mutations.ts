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
import { DocumentModelError, type GovernableDocument, type Unit } from '../document-model/types.js';

// The design-inbox status bullet is grammar-specific: `- **Status:** **<s>**`
// (NOT roadmap's `- status:`). Locate it to rewrite in place (research D3).
const INBOX_STATUS_LINE = /\*\*Status:\*\*/i;

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

/** Find a Unit by identifier, failing loud when absent (Principle V). */
function requireUnit(doc: GovernableDocument, identifier: string): Unit {
  const unit = doc.units.find((u) => u.identifier === identifier);
  if (unit === undefined) throw new DocumentModelError(`inbox has no entry '${identifier}'`);
  return unit;
}

/** 0-based index of the first line within a Unit's span matching `re` (-1 if none). */
function lineInUnit(lines: readonly string[], unit: Unit, re: RegExp): number {
  for (let i = unit.span.startLine - 1; i <= unit.span.endLine - 1; i++) {
    if (re.test(lines[i]!)) return i;
  }
  return -1;
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
  const unit = requireUnit(doc, identifier);
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
  return commit(docPath, lines.join('\n'), opts, apply);
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
