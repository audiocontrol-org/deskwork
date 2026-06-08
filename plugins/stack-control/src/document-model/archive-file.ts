// Structural-marker helpers over an archive file (FR-006). The archive is never
// parsed against the grammar; Units are located/counted by their structural
// markers only — the reserved-level heading for a heading-keyed grammar, or the
// table row for a row-keyed grammar.

import type { GrammarSpec } from './types.js';

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

/** The reserved-level heading marker regex for a heading-keyed grammar. */
export function headingMarkerRe(level: number): RegExp {
  return new RegExp(`^#{${level}}(?!#)\\s+(.+?)\\s*$`);
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
  const lines = archiveSource.split('\n');
  if (grammar.unit.kind === 'heading') {
    const re = headingMarkerRe(grammar.unit.level);
    const ids: string[] = [];
    for (const line of lines) {
      const m = re.exec(line);
      if (m) ids.push(m[1]!);
    }
    return ids;
  }

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
