// AUDIT-20260608-24 (RED-first) — the archived ledger identifiers must be
// validated for the FR-005 invariant set at load time, not merely seeded into
// the uniqueness Set. A ledger entry whose identifier is ordinal/opaque/empty
// (or a DUPLICATE ledger entry) is corruption that `unarchive` could otherwise
// write back into the live document. loadDocument must fail loud (FR-005/FR-010).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocument } from '../../src/document-model/document.js';
import { serializeLedger } from '../../src/document-model/ledger.js';
import { DocumentModelError, type LedgerEntry } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const OPTS = { builtinGrammarDir: BUILTIN };
const NOW = '2026-06-08T00:00:00.000Z';

// A minimal live design-inbox document with one live, non-ordinal Unit.
const INBOX = [
  '---',
  'doc-grammar: design-inbox',
  '---',
  '',
  '# Inbox',
  '',
  '### Active idea',
  '- **Status:** **captured** (live)',
  '',
].join('\n');

/** Author a live doc + a sibling `<doc>-archive.md` whose ledger holds `entries`. */
function tmpDocWithLedger(entries: readonly LedgerEntry[]) {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-id-validation-'));
  const docPath = join(dir, 'INBOX.md');
  const archivePath = join(dir, 'INBOX-archive.md');
  writeFileSync(docPath, INBOX, 'utf8');
  // The ledger lives in its own `doc-archive-ledger` comment block in the
  // archive file (FR-006); archived-Unit content isn't needed for load-time
  // identifier validation (validation reads the ledger, not the body).
  const archive = ['---', 'doc-grammar: design-inbox', '---', '', serializeLedger(entries), ''].join('\n');
  writeFileSync(archivePath, archive, 'utf8');
  return { docPath, archivePath };
}

describe('ledger identifier validation at load (AUDIT-20260608-24)', () => {
  it('rejects an ORDINAL archived ledger identifier (e.g. F3)', () => {
    const { docPath } = tmpDocWithLedger([
      { identifier: 'F3', archivedAt: NOW, fromStatus: 'promoted' },
    ]);
    expect(() => loadDocument(docPath, OPTS)).toThrow(DocumentModelError);
    expect(() => loadDocument(docPath, OPTS)).toThrow(/ordinal|positional|sequence index/i);
  });

  it('rejects a DUPLICATE archived ledger identifier', () => {
    const { docPath } = tmpDocWithLedger([
      { identifier: 'Shipped idea', archivedAt: NOW, fromStatus: 'promoted' },
      { identifier: 'Shipped idea', archivedAt: NOW, fromStatus: 'promoted' },
    ]);
    expect(() => loadDocument(docPath, OPTS)).toThrow(DocumentModelError);
    expect(() => loadDocument(docPath, OPTS)).toThrow(/unique|duplicate/i);
  });

  it('does NOT throw for a valid (readable, non-ordinal, unique) ledger identifier', () => {
    const { docPath } = tmpDocWithLedger([
      { identifier: 'Shipped idea', archivedAt: NOW, fromStatus: 'promoted' },
    ]);
    expect(() => loadDocument(docPath, OPTS)).not.toThrow();
  });
});
