// Structural-marker helpers over an archive file (FR-006). The archive is never
// parsed against the grammar; Units are located/counted by their structural
// markers only — the reserved-level heading for a heading-keyed grammar, or the
// table row for a row-keyed grammar.

import type { GrammarSpec } from './types.js';

/** Split a markdown table row into trimmed cells (drops the outer pipes). */
export function tableCells(line: string): string[] {
  const parts = line.split('|');
  return parts.slice(1, parts.length - 1).map((c) => c.trim());
}

/** True for a table separator row (`|---|:--:|`). */
export function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/** The reserved-level heading marker regex for a heading-keyed grammar. */
export function headingMarkerRe(level: number): RegExp {
  return new RegExp(`^#{${level}}(?!#)\\s+(.+?)\\s*$`);
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
