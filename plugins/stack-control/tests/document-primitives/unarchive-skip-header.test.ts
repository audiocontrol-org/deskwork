// AUDIT-20260608-46 (RED-first) — locateInArchive must NOT treat the archive
// table HEADER row as a candidate Unit. archiveMarkerIds correctly skips
// everything before the separator (its `pastSeparator` flag); locate's
// row-keyed scan must mirror that. Today the header cell "Codename" won't equal
// a real <phase>/<slug> id, so nothing breaks — but an id literally matching a
// header cell (or a malformed archive) would mis-locate the header as a Unit.
//
// This test seeds a ledger entry whose identifier equals the header's
// id-column value ("Codename") so the ledger-entry guard passes and the code
// reaches locateInArchive's row scan. Before the fix, locate matches the header
// row and lifts it; after the fix it skips the header and reports a locate
// failure (the header is NOT a Unit).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { runUnarchive } from '../../src/document-model/unarchive-engine.js';
import { loadDocument } from '../../src/document-model/document.js';
import { readLedger, withLedger, serializeLedger } from '../../src/document-model/ledger.js';
import type { LedgerEntry } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const NOW = '2026-06-08T00:00:00.000Z';
const OPTS = { now: NOW, builtinGrammarDir: BUILTIN };

const ROADMAP = [
  '---',
  'doc-grammar: roadmap-legacy',
  '---',
  '',
  '# Roadmap',
  '',
  '| Codename | Feature | Scope | Status |',
  '|---|---|---|---|',
  '| design/insight-capture | Capture | one move | planned |',
  '| impl/execution-engine | Engine | fan-out | shipped |',
  '',
].join('\n');

function tmpDoc(body: string, name = 'ROADMAP.md') {
  const dir = mkdtempSync(join(tmpdir(), 'unarchive-skip-header-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath, archivePath: join(dir, name.replace(/\.md$/, '-archive.md')) };
}

function liveIds(docPath: string): string[] {
  return loadDocument(docPath, OPTS).doc.units.map((u) => u.identifier);
}

describe('unarchive — header row is never a Unit (AUDIT-20260608-46)', () => {
  it('a normal archived row still round-trips (regression guard)', () => {
    const { docPath, archivePath } = tmpDoc(ROADMAP);
    runArchive(docPath, { apply: true, ...OPTS }); // archives impl/execution-engine (shipped)
    expect(liveIds(docPath)).toEqual(['design/insight-capture']);

    runUnarchive(docPath, { id: 'impl/execution-engine', apply: true, ...OPTS });
    expect(liveIds(docPath)).toEqual(['design/insight-capture', 'impl/execution-engine']);
    expect(readLedger(readFileSync(archivePath, 'utf8'))).toEqual([]);
  });

  it('does NOT lift the archive table HEADER row when an id matches a header cell', () => {
    const { docPath, archivePath } = tmpDoc(ROADMAP);
    runArchive(docPath, { apply: true, ...OPTS }); // archives impl/execution-engine
    const ROADMAP_AFTER_ARCHIVE = readFileSync(docPath, 'utf8');

    // Seed a ledger entry whose identifier equals the header's id-column value
    // ("Codename") so the ledger-entry guard in runUnarchive passes and the
    // code reaches locateInArchive's row scan. The header row of the archive
    // table is `| Codename | Feature | Scope | Status |`.
    const archiveBefore = readFileSync(archivePath, 'utf8');
    const seeded: LedgerEntry[] = [
      ...readLedger(archiveBefore),
      { identifier: 'Codename', archivedAt: NOW, fromStatus: 'shipped' },
    ];
    // The archive already has a ledger block (withLedger replaces it).
    const withSeed = archiveBefore.includes('doc-archive-ledger')
      ? withLedger(archiveBefore, seeded)
      : `${archiveBefore}\n${serializeLedger(seeded)}\n`;
    writeFileSync(archivePath, withSeed, 'utf8');

    // locateInArchive must skip the header row → no Unit found → fail loud.
    // Before the fix, it matches the header (cells[0] === 'Codename') and lifts it.
    expect(() => runUnarchive(docPath, { id: 'Codename', apply: true, ...OPTS })).toThrow(
      /was not found in the archive table/i,
    );

    // No write happened: 'Codename' is not a live Unit. The live doc is
    // byte-for-byte unchanged (the header column "Codename" legitimately
    // remains in the live table — what must NOT appear is a lifted header row).
    expect(liveIds(docPath)).toEqual(['design/insight-capture']);
    expect(readFileSync(docPath, 'utf8')).toBe(ROADMAP_AFTER_ARCHIVE);
  });
});
