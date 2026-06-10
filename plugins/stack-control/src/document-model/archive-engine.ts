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
import { loadDocument, loadDocumentFromSource, type LoadOptions } from './document.js';
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
  // Filter out the cut spans, then collapse the gap each cut leaves: a blank
  // line that sits immediately AFTER a removed region is dropped when the
  // last-kept line is also blank, so a middle cut can't accrete a double blank
  // (AUDIT-20260608-33). This operates only at cut boundaries — a `justCut`
  // flag is set only when the previous source line was part of a removed span,
  // so blank lines inside retained blocks (e.g. fenced code) are never touched.
  const kept: string[] = [];
  let justCut = false;
  for (let i = 0; i < doc.sourceLines.length; i++) {
    const line = doc.sourceLines[i]!;
    if (cut.has(i + 1)) {
      justCut = true;
      continue;
    }
    if (justCut && line.trim() === '' && kept.length > 0 && kept[kept.length - 1]!.trim() === '') {
      // Drop this boundary blank: the line preceding the cut was already blank,
      // so keeping this one would double the blank run at the seam.
      continue;
    }
    kept.push(line);
    justCut = false;
  }
  return kept.join('\n');
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

/** Append one ledger entry per moved Unit to the existing ledger (FR-006). */
function ledgerWithMoves(
  ledger: readonly LedgerEntry[],
  moved: readonly Unit[],
  now: string,
): LedgerEntry[] {
  return [
    ...ledger,
    ...moved.map((u) => ({ identifier: u.identifier, archivedAt: now, fromStatus: u.status })),
  ];
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

/** Validate that an `--apply` archive of `docPath` would succeed WITHOUT
 * writing anything. Loads + parses + composes the would-be archive + live
 * outputs, surfacing every fail-loud `DocumentModelError` the write path would
 * raise (notably the row-keyed column-schema mismatch). Returns when the apply
 * is provably write-safe; throws otherwise. This is the seam curate uses to
 * preflight its composed archive step before it mutates the live document, so a
 * validation/config failure leaves the live document untouched (FR-010 zero
 * writes). */
export function preflightArchive(docPath: string, opts: LoadOptions & { readonly now?: string }): void {
  const { doc, stream, ledger } = loadDocument(docPath, opts);
  const archivable = selectArchivable(doc);
  if (archivable.length === 0) return;

  const newLedger = ledgerWithMoves(ledger, archivable, opts.now ?? new Date().toISOString());

  // buildArchive throws every archive-side fail-loud DocumentModelError; running
  // it here (and discarding the result) is the validation preflight.
  buildArchive(doc, stream, archivable, newLedger);

  // The post-cut LIVE document must itself remain governable: cutting a terminal
  // Unit that is still a `depends-on`/`part-of` target of a surviving Unit would
  // leave a dangling reference, bricking every subsequent load (AUDIT-20260608-07).
  // Re-validate the candidate live content through the full pipeline; a referential-
  // integrity (or acyclicity / identifier) violation fails loud here, BEFORE any
  // write (FR-010 zero-write). Edge-free grammars have no inbound edges, so this is
  // a no-op for them (assertReferentialIntegrity returns early).
  loadDocumentFromSource(liveWithout(doc, archivable), doc.path, opts);
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

  const newLedger = ledgerWithMoves(ledger, archivable, opts.now ?? new Date().toISOString());

  const newArchive = buildArchive(doc, stream, archivable, newLedger);
  const newLive = liveWithout(doc, archivable);

  // Re-validate the post-cut LIVE document through the full pipeline BEFORE any
  // write: cutting a terminal Unit that is still an edge target of a surviving
  // Unit dangles a reference and bricks the document (AUDIT-20260608-07). A
  // referential-integrity / acyclicity / identifier violation fails loud here,
  // leaving BOTH files untouched (FR-010 zero-write). No-op for edge-free grammars.
  loadDocumentFromSource(newLive, doc.path, opts);

  // Archive first (so moved content exists before it is removed from live),
  // then the live document.
  writeFileSync(doc.archivePath, newArchive, 'utf8');
  opts.afterArchiveWriteHook?.();
  writeFileSync(doc.path, newLive, 'utf8');

  return { applied: true, moves, archivePath: doc.archivePath };
}
