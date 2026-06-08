// Shared document load (FR-001/FR-002/FR-003/FR-005). The single parse path
// that archive/unarchive/curate all compose: resolve grammar → block stream →
// Units → validate identifiers against the document ∪ ledger union. Any
// validation failure here fails loud BEFORE any verb writes (FR-010 absolute
// zero-writes for validation failures).

import { existsSync, readFileSync } from 'node:fs';
import { buildBlockStream } from './block-stream.js';
import { resolveGrammar, type ResolveOptions } from './grammar-resolver.js';
import { parseUnits } from './grammar-parse.js';
import { assertOrderKeyNotIdentifier, validateIdentifiers } from './identifier-validator.js';
import { readLedger } from './ledger.js';
import {
  DocumentModelError,
  type BlockStream,
  type GovernableDocument,
  type LedgerEntry,
} from './types.js';

export type LoadOptions = ResolveOptions;

export interface LoadedDocument {
  readonly doc: GovernableDocument;
  /** The normalized block stream (lets row-keyed archive find the table head). */
  readonly stream: BlockStream;
  /** The provenance ledger read from the archive file ([] when none). */
  readonly ledger: readonly LedgerEntry[];
}

/** Sibling archive path: `<doc>-archive.md` (FR-006). */
export function archivePathFor(docPath: string): string {
  return docPath.endsWith('.md') ? `${docPath.slice(0, -3)}-archive.md` : `${docPath}-archive.md`;
}

export function loadDocument(docPath: string, opts: LoadOptions): LoadedDocument {
  if (!existsSync(docPath)) {
    throw new DocumentModelError(`document not found: ${docPath}`);
  }
  const source = readFileSync(docPath, 'utf8');
  const sourceLines = source.split('\n');

  const grammar = resolveGrammar(source, opts);
  assertOrderKeyNotIdentifier(grammar);

  const stream = buildBlockStream(source);
  const units = parseUnits(grammar, stream, sourceLines);

  const archivePath = archivePathFor(docPath);
  const ledger = existsSync(archivePath) ? readLedger(readFileSync(archivePath, 'utf8')) : [];

  // FR-005 uniqueness over document ∪ archive — archived ids come SOLELY from
  // the ledger (FR-006), never from scanning the archive contents.
  validateIdentifiers(units, ledger.map((e) => e.identifier));

  const doc: GovernableDocument = { path: docPath, archivePath, grammar, units, sourceLines };
  return { doc, stream, ledger };
}
