// Shared mutation primitives for governed-document mutators (roadmap, inbox, …).
// Each mutator computes a CANDIDATE document in memory, re-validates the WHOLE
// governed document via loadDocumentFromSource, and writes only on apply — a
// validation failure throws BEFORE any write (zero-write-on-failure). These
// generic helpers are the single source of that contract; the per-noun mutators
// (src/roadmap/mutations.ts, src/inbox/mutations.ts) compose them rather than
// each re-deriving the validate-then-write / unit-locating / append plumbing.

import {
  chmodSync,
  lstatSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { loadDocumentFromSource, type LoadOptions } from './document.js';
import type { GovernableDocument, Unit } from './types.js';

export interface MutationResult {
  readonly applied: boolean;
  /** The candidate document source (the new content, applied or dry-run). */
  readonly source: string;
}

// Monotonic suffix for temp file names (Math.random()/Date.now() are unavailable
// in some runtime contexts; pid + counter is collision-resistant enough here).
let tempCounter = 0;

/**
 * Atomically replace `docPath` with `contents`: write a same-directory temp file
 * first, then `renameSync` over the target — atomic within one filesystem, so a
 * crash/interrupt/disk-error during the write can never leave the live governed
 * document truncated or torn (AUDIT-BARRAGE-codex-01). On any failure the temp
 * file is best-effort removed and the error rethrown — no temp artifact is left
 * behind, and the live document is either fully the old content or fully the new.
 *
 * Identity-preserving (AUDIT-BARRAGE-claude-01): when `docPath` is a symlink we
 * rewrite its REAL target (so the symlink survives and keeps pointing at the
 * now-updated file), and we copy the existing target's permission mode onto the
 * temp file before the rename (so a non-default mode is not silently lost).
 *
 * Precondition (AUDIT-20260609-17): temp-then-rename requires WRITE permission on
 * the document's PARENT DIRECTORY (to create the temp file and rename over the
 * target) — a deliberate trade-off for atomicity, stricter than the prior
 * in-place write which needed only file-write permission. A writable governed
 * doc inside a read-only directory will fail loud (EACCES/EROFS, zero write).
 */
function atomicReplace(docPath: string, contents: string): void {
  // Resolve a symlink to its real path so we replace the underlying file, not
  // the link — renaming over the link would clobber it into a regular file.
  const target = lstatSync(docPath).isSymbolicLink() ? realpathSync(docPath) : docPath;
  const tempPath = join(dirname(target), `.${basename(target)}.tmp-${process.pid}-${tempCounter++}`);
  try {
    writeFileSync(tempPath, contents, 'utf8');
    // Preserve the original file's permission mode across the replacement. `target`
    // is GUARANTEED to exist: the `lstatSync(docPath)` above already threw if it
    // didn't, and every caller runs `loadDocument(docPath)` first — atomicReplace
    // never creates a new file, so the mode copy is unconditional.
    chmodSync(tempPath, statSync(target).mode & 0o777);
    renameSync(tempPath, target);
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      // best-effort cleanup; the original error is what matters
    }
    throw err;
  }
}

/**
 * Re-validate a candidate document against its grammar + graph, then write it
 * iff `apply`. A validation failure throws `DocumentModelError` *before* any
 * write (zero-write); on success and dry-run, the candidate is returned but not
 * written. The on-apply write is atomic (temp-then-rename). The single fail-safe
 * substrate every mutation commits through.
 */
export function commitCandidate(
  docPath: string,
  candidate: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  loadDocumentFromSource(candidate, docPath, opts);
  if (apply) atomicReplace(docPath, candidate);
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
