// The provenance ledger (FR-006): the record of what was archived and when,
// keyed by identifier (never by an ordinal range). It lives IN the archive file
// in its OWN distinct section — an HTML comment block with the
// `doc-archive-ledger` sentinel — kept separate from the archived-Unit
// sections/table so a scanner never confuses a ledger line with a Unit marker.

import { DocumentModelError, type LedgerEntry } from './types.js';

const LEDGER_SENTINEL = 'doc-archive-ledger';
const FIELD_SEP = '\t';

/**
 * Parse the ledger from an archive file's source. Returns [] when the file has
 * no ledger block (e.g. a hand-created or empty archive). A malformed ledger
 * line fails loud (FR-010) — the ledger is authoritative and must be readable.
 */
export function readLedger(archiveSource: string): LedgerEntry[] {
  const lines = archiveSource.split('\n');
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (start === -1 && trimmed.startsWith('<!--') && lines[i]!.includes(LEDGER_SENTINEL)) {
      start = i;
      // The sentinel line may also close on the same line (empty ledger).
      if (trimmed.includes('-->')) {
        end = i;
        break;
      }
      continue;
    }
    if (start !== -1 && lines[i]!.includes('-->')) {
      end = i;
      break;
    }
  }
  if (start === -1) return [];
  if (end === -1) {
    throw new DocumentModelError('archive ledger: unterminated `doc-archive-ledger` comment block');
  }

  const entries: LedgerEntry[] = [];
  for (let i = start + 1; i < end; i++) {
    const raw = lines[i]!.trim();
    if (raw.length === 0) continue;
    const parts = raw.split(FIELD_SEP);
    if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
      throw new DocumentModelError(
        `archive ledger: malformed entry '${raw}' (expected identifier<TAB>archivedAt<TAB>fromStatus)`,
      );
    }
    entries.push({ identifier: parts[0]!, archivedAt: parts[1]!, fromStatus: parts[2]! });
  }
  return entries;
}

/** Render the ledger as its own HTML-comment section (FR-006). */
export function serializeLedger(entries: readonly LedgerEntry[]): string {
  const body = entries
    .map((e) => `${e.identifier}${FIELD_SEP}${e.archivedAt}${FIELD_SEP}${e.fromStatus}`)
    .join('\n');
  return `<!-- ${LEDGER_SENTINEL}\n${body}\n-->`;
}

/** Replace (or insert) the ledger section in an archive source, returning the
 * new source. The ledger always sits immediately after any frontmatter and
 * before the archived-Unit content. */
export function withLedger(archiveSource: string, entries: readonly LedgerEntry[]): string {
  const lines = archiveSource.split('\n');
  // Find an existing ledger block to replace.
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && lines[i]!.trim().startsWith('<!--') && lines[i]!.includes(LEDGER_SENTINEL)) {
      start = i;
      if (lines[i]!.includes('-->')) {
        end = i;
        break;
      }
    } else if (start !== -1 && lines[i]!.includes('-->')) {
      end = i;
      break;
    }
  }
  const ledger = serializeLedger(entries);
  if (start !== -1 && end !== -1) {
    const before = lines.slice(0, start).join('\n');
    const after = lines.slice(end + 1).join('\n');
    return `${before}${ledger}${after.length > 0 ? `\n${after}` : ''}`;
  }
  // No existing ledger — caller is responsible for placement; default appends.
  return `${archiveSource}\n${ledger}\n`;
}
