// The unarchive primitive (FR-007): the symmetric reversal of archive. Locate a
// named Unit via its ledger entry, lift it from the archive file (scan for the
// identifier marker → next same-level marker), return it to the live document at
// its declared-order position relative to current neighbors (touching only that
// Unit), and remove its ledger entry. Dry-run is the default.
//
// Durability (FR-007/FR-010): the live document (destination) is written FIRST,
// then the archive (source) is rewritten — so a crash between leaves the Unit
// in BOTH files (a recoverable uniqueness violation), never silently lost. A
// locate failure (absent/empty ledger or no entry) and an identity collision
// fail loud with zero writes.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isSeparatorRow, tableCells } from './archive-file.js';
import { buildBlockStream } from './block-stream.js';
import { loadDocument, type LoadOptions } from './document.js';
import { parseUnits } from './grammar-parse.js';
import { withLedger } from './ledger.js';
import { assertInDomain, compareUnits } from './ordering.js';
import {
  DocumentModelError,
  type ArchiveMove,
  type ArchiveResult,
  type GovernableDocument,
  type GrammarSpec,
  type Unit,
} from './types.js';

export interface UnarchiveOptions extends LoadOptions {
  readonly id: string;
  readonly apply: boolean;
}

interface Located {
  /** The Unit's content lines (trailing blanks trimmed), for reinsertion. */
  readonly contentLines: string[];
  /** Inclusive 0-based archive line range to remove on apply. */
  readonly removeStart: number;
  readonly removeEnd: number;
}

/** Locate the archived Unit's content by its structural marker (FR-006/FR-007). */
function locateInArchive(archiveSource: string, grammar: GrammarSpec, id: string): Located {
  const lines = archiveSource.split('\n');
  if (grammar.unit.kind === 'heading') {
    const level = grammar.unit.level;
    const head = new RegExp(`^#{${level}}(?!#)\\s+(.+?)\\s*$`);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      const m = head.exec(lines[i]!);
      if (m && m[1] === id) {
        start = i;
        break;
      }
    }
    if (start === -1) {
      throw new DocumentModelError(
        `unarchive: ledger references '${id}', but its content was not found in the archive body`,
      );
    }
    let end = lines.length - 1;
    for (let j = start + 1; j < lines.length; j++) {
      if (head.test(lines[j]!)) {
        end = j - 1;
        break;
      }
    }
    const slice = lines.slice(start, end + 1);
    while (slice.length > 0 && slice[slice.length - 1]!.trim() === '') slice.pop();
    return { contentLines: slice, removeStart: start, removeEnd: end };
  }

  // Row-keyed: the marker is the table row whose identifier column equals id.
  // Mirror archiveMarkerIds (archive-file.ts): only DATA rows after the
  // separator are candidate Units — the leading header row is column-schema
  // chrome and must never be located as a Unit (AUDIT-20260608-46).
  const idCol = grammar.unit.identifierColumn;
  let pastSeparator = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trimStart().startsWith('|')) continue;
    const cells = tableCells(line);
    if (isSeparatorRow(cells)) {
      pastSeparator = true;
      continue;
    }
    if (!pastSeparator) continue; // the header row is chrome, not a Unit
    if (idCol < cells.length && cells[idCol] === id) {
      return { contentLines: [line], removeStart: i, removeEnd: i };
    }
  }
  throw new DocumentModelError(
    `unarchive: ledger references '${id}', but its row was not found in the archive table`,
  );
}

/** Re-parse the lifted content as a one-Unit document to recover its orderValue. */
function parseLifted(grammar: GrammarSpec, located: Located, doc: GovernableDocument): Unit {
  let mini: string;
  if (grammar.unit.kind === 'row') {
    const header = doc.sourceLines.find((l) => l.trimStart().startsWith('|') && !isSeparatorRow(tableCells(l)));
    if (header === undefined) {
      throw new DocumentModelError(
        `unarchive: row-keyed live document ${doc.path} has no table header to reinsert into (see T044)`,
      );
    }
    // AUDIT-20260608-36: guard the archived row's column count against the
    // CURRENT live table header — symmetric with archive's "column-schema
    // mismatch" fail-loud (archive-engine.ts buildArchive). Reinserting a row
    // whose column count disagrees with the live table would silently misalign
    // it (the identifier/status columns can still parse). Fail loud with zero
    // writes (this runs before any write).
    const liveCols = tableCells(header).length;
    const rowCols = tableCells(located.contentLines[0]!).length;
    if (rowCols !== liveCols) {
      throw new DocumentModelError(
        `unarchive: row-keyed column-schema mismatch — the live document table has ${liveCols} columns but the archived row has ${rowCols}; reconcile the schema before unarchiving (FR-007)`,
      );
    }
    const sep = `|${tableCells(header).map(() => '---').join('|')}|`;
    mini = `${header}\n${sep}\n${located.contentLines.join('\n')}`;
  } else {
    mini = located.contentLines.join('\n');
  }
  const units = parseUnits(grammar, buildBlockStream(mini), mini.split('\n'));
  if (units.length !== 1 || units[0]!.identifier === undefined) {
    throw new DocumentModelError(`unarchive: could not parse the lifted Unit for reinsertion`);
  }
  return units[0]!;
}

function insertIntoLive(doc: GovernableDocument, located: Located, lifted: Unit): string {
  const grammar = doc.grammar;
  assertInDomain(grammar, lifted);
  const liveUnits = doc.units;
  let pos = liveUnits.findIndex((u) => compareUnits(grammar, lifted, u) < 0);
  if (pos === -1) pos = liveUnits.length;

  const lines = [...doc.sourceLines];
  const rowKeyed = grammar.unit.kind === 'row';

  if (liveUnits.length === 0) {
    if (rowKeyed) {
      // AUDIT-06 / T044: archiving every data row leaves the table header +
      // separator (chrome, not Units) in the live document. Reinsert the row
      // immediately after the separator so it rejoins that table.
      const sepIdx = lines.findIndex(
        (l) => l.trimStart().startsWith('|') && isSeparatorRow(tableCells(l)),
      );
      if (sepIdx === -1) {
        throw new DocumentModelError(
          `unarchive: the live row-keyed document has no table (header + separator) to reinsert '${lifted.identifier}' into`,
        );
      }
      lines.splice(sepIdx + 1, 0, ...located.contentLines);
      return lines.join('\n');
    }
    lines.push('', ...located.contentLines);
    return lines.join('\n');
  }

  if (pos < liveUnits.length) {
    const at = liveUnits[pos]!.span.startLine - 1;
    const block = rowKeyed ? located.contentLines : [...located.contentLines, ''];
    lines.splice(at, 0, ...block);
  } else {
    const after = liveUnits[liveUnits.length - 1]!.span.endLine; // 0-based index past the last line
    const block = rowKeyed ? located.contentLines : ['', ...located.contentLines];
    lines.splice(after, 0, ...block);
  }
  return lines.join('\n');
}

export function runUnarchive(docPath: string, opts: UnarchiveOptions): ArchiveResult {
  const { doc, ledger } = loadDocument(docPath, opts);

  // Locate via the ledger (FR-007): an absent/empty ledger or no entry for the
  // id is a fail-loud locate failure.
  if (!existsSync(doc.archivePath)) {
    throw new DocumentModelError(`unarchive: cannot locate '${opts.id}' — no archive file (${doc.archivePath})`);
  }
  const entry = ledger.find((e) => e.identifier === opts.id);
  if (entry === undefined) {
    throw new DocumentModelError(
      `unarchive: cannot locate '${opts.id}' — no ledger entry in ${doc.archivePath} (locate failure)`,
    );
  }

  const archiveSource = readFileSync(doc.archivePath, 'utf8');
  const located = locateInArchive(archiveSource, doc.grammar, opts.id);
  const lifted = parseLifted(doc.grammar, located, doc);

  const move: ArchiveMove = { identifier: lifted.identifier, status: entry.fromStatus, span: lifted.span };
  if (!opts.apply) {
    return { applied: false, moves: [move], archivePath: doc.archivePath };
  }

  // Destination (live) first, then source (archive).
  const newLive = insertIntoLive(doc, located, lifted);
  writeFileSync(doc.path, newLive, 'utf8');

  const archiveLines = archiveSource.split('\n');
  archiveLines.splice(located.removeStart, located.removeEnd - located.removeStart + 1);
  const remaining = ledger.filter((e) => e.identifier !== opts.id);
  const newArchive = withLedger(archiveLines.join('\n'), remaining);
  writeFileSync(doc.archivePath, newArchive, 'utf8');

  return { applied: true, moves: [move], archivePath: doc.archivePath };
}
