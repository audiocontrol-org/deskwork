// The archive primitive (FR-006/FR-009/FR-010, SC-001): select terminal-status
// Units, cut them by span from the live document, append them to the sibling
// archive file, and record one ledger entry per move IN the archive file. The
// live document keeps ZERO archive bookkeeping. Dry-run is the default; writing
// requires `--apply`.
//
// Durability (the canonical scoped promise — FR-010): validation failures fail
// loud before any write (zero writes, both files); on `--apply` the archive is
// written FIRST so a crash before the live rewrite leaves the moved content in
// the archive (recoverable, never silently lost), not destroyed.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { archiveTableHeaderCells, tableCells } from './archive-file.js';
import { loadDocument, type LoadOptions } from './document.js';
import { withLedger, serializeLedger } from './ledger.js';
import {
  DocumentModelError,
  type ArchiveMove,
  type ArchiveResult,
  type BlockStream,
  type GovernableDocument,
  type LedgerEntry,
  type Unit,
} from './types.js';

export interface ArchiveOptions extends LoadOptions {
  readonly apply: boolean;
  /** Archive timestamp (injected for deterministic tests). */
  readonly now?: string;
  /** Test-only: fire after the archive file is written, before the live
   * rewrite — exercises the durability ordering. */
  readonly afterArchiveWriteHook?: () => void;
}

/** Units whose status is terminal (archivable) per the grammar (FR-004). */
export function selectArchivable(doc: GovernableDocument): Unit[] {
  return doc.units.filter((u) => doc.grammar.terminalStatuses.includes(u.status));
}

function liveWithout(doc: GovernableDocument, moved: readonly Unit[]): string {
  const cut = new Set<number>();
  for (const u of moved) {
    for (let line = u.span.startLine; line <= u.span.endLine; line++) cut.add(line);
  }
  return doc.sourceLines.filter((_, i) => !cut.has(i + 1)).join('\n');
}

/** The header + separator lines of a row-keyed document's table (FR-006). */
function rowTablePreamble(doc: GovernableDocument, stream: BlockStream): { header: string; separator: string } {
  const thead = stream.entries.find((e) => e.kind === 'THEAD');
  if (thead === undefined) {
    throw new DocumentModelError(
      `row-keyed grammar '${doc.grammar.id}': no table header found in ${doc.path}`,
    );
  }
  const header = doc.sourceLines[thead.span.startLine - 1];
  const separator = doc.sourceLines[thead.span.startLine];
  if (header === undefined || separator === undefined) {
    throw new DocumentModelError(`row-keyed grammar '${doc.grammar.id}': malformed table head in ${doc.path}`);
  }
  return { header, separator };
}

function buildArchive(
  doc: GovernableDocument,
  stream: BlockStream,
  moved: readonly Unit[],
  newLedger: readonly LedgerEntry[],
): string {
  const exists = existsSync(doc.archivePath);
  const existing = exists ? readFileSync(doc.archivePath, 'utf8') : '';
  const unitContent = moved.map((u) => u.body);

  if (!exists) {
    const frontmatter = `---\narchive-of: ${doc.path.split('/').pop() ?? doc.path}\n---\n`;
    const ledger = serializeLedger(newLedger);
    if (doc.grammar.unit.kind === 'row') {
      const { header, separator } = rowTablePreamble(doc, stream);
      return `${frontmatter}\n${ledger}\n\n${header}\n${separator}\n${unitContent.join('\n')}\n`;
    }
    return `${frontmatter}\n${ledger}\n\n${unitContent.join('\n\n')}\n`;
  }

  // Append to an existing archive: replace the ledger in place, then append the
  // moved Units at EOF (append-only — FR-006).
  const withNewLedger = withLedger(existing, newLedger).replace(/\n+$/, '');
  if (doc.grammar.unit.kind === 'row') {
    // AUDIT-04 / T048: the archived-Unit table reproduces the live header +
    // column schema. If the live document's column count has since changed,
    // appending a row would silently misalign the archive table — fail loud
    // (the migration hazard) rather than corrupt it.
    const archiveHeader = archiveTableHeaderCells(existing);
    const { header } = rowTablePreamble(doc, stream);
    const liveCols = tableCells(header).length;
    if (archiveHeader !== null && archiveHeader.length !== liveCols) {
      throw new DocumentModelError(
        `archive: row-keyed column-schema mismatch — the live document table has ${liveCols} columns but the existing archive table has ${archiveHeader.length}; reconcile the schema before archiving (FR-006)`,
      );
    }
    // Rows append directly after the last existing row (no blank line) so they
    // stay in the same archived-Unit table.
    return `${withNewLedger}\n${unitContent.join('\n')}\n`;
  }
  return `${withNewLedger}\n\n${unitContent.join('\n\n')}\n`;
}

export function runArchive(docPath: string, opts: ArchiveOptions): ArchiveResult {
  const { doc, stream, ledger } = loadDocument(docPath, opts);
  const archivable = selectArchivable(doc);
  const moves: ArchiveMove[] = archivable.map((u) => ({
    identifier: u.identifier,
    status: u.status,
    span: u.span,
  }));

  if (!opts.apply || archivable.length === 0) {
    return { applied: false, moves: opts.apply ? [] : moves, archivePath: doc.archivePath };
  }

  const now = opts.now ?? new Date().toISOString();
  const newLedger: LedgerEntry[] = [
    ...ledger,
    ...archivable.map((u) => ({ identifier: u.identifier, archivedAt: now, fromStatus: u.status })),
  ];

  const newArchive = buildArchive(doc, stream, archivable, newLedger);
  const newLive = liveWithout(doc, archivable);

  // Archive first (so moved content exists before it is removed from live),
  // then the live document.
  writeFileSync(doc.archivePath, newArchive, 'utf8');
  opts.afterArchiveWriteHook?.();
  writeFileSync(doc.path, newLive, 'utf8');

  return { applied: true, moves, archivePath: doc.archivePath };
}
