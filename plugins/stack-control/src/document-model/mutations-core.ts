// Shared mutation primitives for governed-document mutators (roadmap, inbox, …).
// Each mutator computes a CANDIDATE document in memory, re-validates the WHOLE
// governed document via loadDocumentFromSource, and writes only on apply — a
// validation failure throws BEFORE any write (zero-write-on-failure). These
// generic helpers are the single source of that contract; the per-noun mutators
// (src/roadmap/mutations.ts, src/inbox/mutations.ts) compose them rather than
// each re-deriving the validate-then-write / unit-locating / append plumbing.

import { writeFileSync } from 'node:fs';
import { loadDocumentFromSource, type LoadOptions } from './document.js';
import type { GovernableDocument, Unit } from './types.js';

export interface MutationResult {
  readonly applied: boolean;
  /** The candidate document source (the new content, applied or dry-run). */
  readonly source: string;
}

/**
 * Re-validate a candidate document against its grammar + graph, then write it
 * iff `apply`. A validation failure throws `DocumentModelError` *before* any
 * write (zero-write); on success and dry-run, the candidate is returned but not
 * written. The single fail-safe substrate every mutation commits through.
 */
export function commitCandidate(
  docPath: string,
  candidate: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  loadDocumentFromSource(candidate, docPath, opts);
  if (apply) writeFileSync(docPath, candidate, 'utf8');
  return { applied: apply, source: candidate };
}

/** Find a Unit by identifier (undefined when absent). Callers raise their own
 * contextual fail-loud error so the message names the right noun. */
export function findUnit(doc: GovernableDocument, identifier: string): Unit | undefined {
  return doc.units.find((u) => u.identifier === identifier);
}

/** 0-based index of the first line within a Unit's span matching `re` (-1 if none). */
export function lineInUnit(lines: readonly string[], unit: Unit, re: RegExp): number {
  for (let i = unit.span.startLine - 1; i <= unit.span.endLine - 1; i++) {
    if (re.test(lines[i]!)) return i;
  }
  return -1;
}

/**
 * Join `before` + `section` + `after` with exactly one blank line on each side
 * of the section, never doubling an already-blank edge — so repeated appends
 * (the most frequent mutation) don't accumulate blank lines (AUDIT-20260608-11).
 */
export function spliceWithBlankLines(
  before: readonly string[],
  section: readonly string[],
  after: readonly string[],
): string {
  const preBlank = before.length > 0 && before[before.length - 1]!.trim() !== '' ? [''] : [];
  const postBlank = after.length > 0 && after[0]!.trim() !== '' ? [''] : [];
  return [...before, ...preBlank, ...section, ...postBlank, ...after].join('\n');
}
