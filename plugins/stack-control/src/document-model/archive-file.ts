// Structural-marker helpers over an archive file (FR-006). The archive is never
// parsed against the grammar; Units are located/counted by their structural
// markers only — the reserved-level heading for a heading-keyed grammar, or the
// table row for a row-keyed grammar.

import { buildBlockStream } from './block-stream.js';
import type { BlockEntry, GrammarSpec } from './types.js';

/**
 * Split a markdown table row into trimmed cells (drops the outer pipes).
 *
 * Splits on UNESCAPED `|` only: a backslash-escaped pipe (`\|`) renders as a
 * literal `|` inside a single cell and is NOT a column delimiter. markdown-it
 * unescapes `\|` → `|` in inline content, so block-stream's live-parse cells
 * carry the literal pipe (AUDIT-20260608-47). To keep the archive-scan side
 * (which sees RAW lines still carrying the `\|` escape) consistent with the
 * live-parse side, each returned cell unescapes `\|` → `|` as well — so
 * identifier/status/marker comparisons match across archive ↔ live.
 */
export function tableCells(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '\\' && line[i + 1] === '|') {
      // Escaped pipe — a literal `|` within the cell, not a delimiter. Emit the
      // unescaped pipe and consume both characters.
      current += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  // Drop the segments outside the leading/trailing outer pipes, then trim.
  return cells.slice(1, cells.length - 1).map((c) => c.trim());
}

/** True for a table separator row (`|---|:--:|`). */
export function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * The reserved-level heading block entries in an archive, in document order
 * (AUDIT-20260608-49). The archive scan is MARKDOWN-AWARE: it reuses the block
 * parser rather than scanning raw lines, so a `###`-shaped line inside a fenced
 * code block (a `CODE` entry, never an `H<level>` entry) cannot be mistaken for
 * a Unit marker.
 *
 * `buildBlockStream` blanks frontmatter + the `doc-grammar:` comment but NOT the
 * `doc-archive-ledger` comment. With `html:false`, markdown-it surfaces the
 * comment's lines as paragraph (`P`) entries — except a `###`-shaped line inside
 * the ledger body would surface as an `H<level>` entry. So we additionally
 * exclude any heading entry whose span falls inside the ledger comment region.
 * (In practice an identifier never starts with `#`, but the exclusion is the
 * robust guard, not a reliance on that.)
 */
export function reservedHeadingEntries(archiveSource: string, level: number): BlockEntry[] {
  const kind = `H${level}`;
  const ledger = ledgerCommentRange(archiveSource);
  return buildBlockStream(archiveSource).entries.filter((e) => {
    if (e.kind !== kind) return false;
    if (ledger !== null && e.span.startLine >= ledger.start && e.span.startLine <= ledger.end) {
      return false; // a `###`-shaped line inside the ledger comment is not a marker
    }
    return true;
  });
}

/** The 1-based inclusive line range of the `doc-archive-ledger` comment, or
 * null when the archive has none. Mirrors ledger.ts's block detection but is
 * kept local to avoid a circular import. */
function ledgerCommentRange(archiveSource: string): { start: number; end: number } | null {
  const lines = archiveSource.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && lines[i]!.trim().startsWith('<!--') && lines[i]!.includes('doc-archive-ledger')) {
      start = i;
      if (lines[i]!.includes('-->')) return { start: start + 1, end: i + 1 };
      continue;
    }
    if (start !== -1 && lines[i]!.includes('-->')) return { start: start + 1, end: i + 1 };
  }
  return null;
}

/** The header row cells of a row-keyed archive's table (the row before the
 * separator), or null when the archive has no table yet. */
export function archiveTableHeaderCells(archiveSource: string): string[] | null {
  const lines = archiveSource.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.trimStart().startsWith('|')) continue;
    const cells = tableCells(lines[i]!);
    if (isSeparatorRow(cells)) continue;
    // The first non-separator table row IS the header (a single archived-Unit
    // table reproduces the live header + separator + column schema — FR-006).
    return cells;
  }
  return null;
}

/**
 * The identifiers present as structural markers in an archive file. For a
 * row-keyed archive the leading header row + separator are chrome and excluded;
 * only data rows after the separator count.
 */
export function archiveMarkerIds(archiveSource: string, grammar: GrammarSpec): string[] {
  if (grammar.unit.kind === 'heading') {
    // Markdown-aware: the markers are the reserved-level heading block entries
    // (AUDIT-20260608-49). The entry's `text` is the heading's identifier.
    return reservedHeadingEntries(archiveSource, grammar.unit.level).map((e) => e.text);
  }

  const lines = archiveSource.split('\n');
  const idCol = grammar.unit.identifierColumn;
  const ids: string[] = [];
  let pastSeparator = false;
  for (const line of lines) {
    if (!line.trimStart().startsWith('|')) continue;
    const cells = tableCells(line);
    if (isSeparatorRow(cells)) {
      pastSeparator = true;
      continue;
    }
    if (!pastSeparator) continue; // the header row is chrome
    if (idCol < cells.length) ids.push(cells[idCol]!);
  }
  return ids;
}
