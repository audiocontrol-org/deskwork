// AUDIT-20260608-26 (RED-first) — row-keyed column indices must be SINGLE-SOURCED
// in the grammar metadata. A project-override / embedded grammar author who shifts
// `identifierColumn` / `statusColumn` in the metadata header must get a live-document
// parse that keys off THOSE columns — not the columns the PEG body hardcodes.
//
// Before the fix, roadmap.peg-style bodies hardcode `cell(..., 0)` / `cell(..., 3)`,
// so an override declaring shifted columns parses the WRONG cells: the identifier is
// read from column 0 (here a leading blank/marker cell) instead of column 1, and the
// archive-marker scan + unarchive `locateInArchive` (which DO read the metadata
// columns) disagree → silent identity mismatch. This test pins the end-to-end
// agreement: live parse, archive, and unarchive all key off the metadata columns.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { runUnarchive } from '../../src/document-model/unarchive-engine.js';
import { loadDocument } from '../../src/document-model/document.js';
import { readLedger } from '../../src/document-model/ledger.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const NOW = '2026-06-08T00:00:00.000Z';
const OPTS = { now: NOW, builtinGrammarDir: BUILTIN };

// An EMBEDDED row-keyed grammar artifact whose metadata uses SHIFTED columns:
// identifier in column 1 (not 0), status in column 4 (not 3). The PEG body reads
// those columns from `options` (the fix); before the fix it would hardcode 0/3.
// The leading column 0 is a deliberately-distracting marker cell so a column-0
// read produces a WRONG identifier.
const GRAMMAR_BLOCK = [
  '<!-- doc-grammar: peg',
  '---',
  'id: shifted-roadmap',
  'unit:',
  '  kind: row',
  '  identifierColumn: 1',
  '  statusColumn: 4',
  'statusVocabulary: [planned, in-flight, shipped, cancelled, retired]',
  'terminalStatuses: [shipped, cancelled, retired]',
  'orderKey:',
  '  field: phase',
  '  relation: [design, plan, impl, multi]',
  'identifier:',
  '  kind: slug',
  'reconciliationHook: null',
  '---',
  '{{',
  '  function cell(text, i) {',
  "    const cells = text.split('\\x1f');",
  "    return i < cells.length ? cells[i].trim() : '';",
  '  }',
  '}}',
  '',
  'document = preamble units:unit* postamble { return units; }',
  '',
  'preamble = (!row anyLine)*',
  '',
  'unit = r:row {',
  '  const id = cell(r.text, options.identifierColumn);',
  '  const status = cell(r.text, options.statusColumn).toLowerCase();',
  "  const phase = id.split('/')[0];",
  '  return { identifier: id, status, orderValue: phase, startLine: r.line, endLine: r.line };',
  '}',
  '',
  'row = "ROW" TAB t:lineText nl { return { text: t, line: location().start.line }; }',
  '',
  'postamble = (!row anyLine)*',
  '',
  'anyLine = kind TAB lineText nl',
  'kind = $[A-Za-z0-9]+',
  'lineText = $[^\\n]*',
  'TAB = "\\t"',
  'nl = "\\n" / !.',
  '-->',
].join('\n');

// A doc whose table puts the `<phase>/<slug>` identifier in column 1 and status in
// column 4. Column 0 is a marker cell ('-') that MUST NOT be read as the identifier.
const DOC = [
  GRAMMAR_BLOCK,
  '',
  '# Shifted Roadmap',
  '',
  '| Mark | Codename | Feature | Scope | Status |',
  '|---|---|---|---|---|',
  '| - | design/insight-capture | Capture | one move | planned |',
  '| - | impl/execution-engine | Engine | fan-out | shipped |',
  '',
].join('\n');

function tmpDoc(body: string, name = 'SHIFTED.md') {
  const dir = mkdtempSync(join(tmpdir(), 'override-column-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath, archivePath: join(dir, name.replace(/\.md$/, '-archive.md')) };
}

function liveIds(docPath: string): string[] {
  return loadDocument(docPath, OPTS).doc.units.map((u) => u.identifier);
}

describe('row-keyed column override (AUDIT-20260608-26)', () => {
  it('reads the identifier from the metadata column (1), NOT the hardcoded column (0)', () => {
    const { docPath } = tmpDoc(DOC);
    expect(liveIds(docPath)).toEqual(['design/insight-capture', 'impl/execution-engine']);
  });

  it('archive→unarchive round-trips a terminal row located by the metadata columns', () => {
    const { docPath, archivePath } = tmpDoc(DOC);

    // `shipped` is terminal → archive lifts impl/execution-engine.
    runArchive(docPath, { apply: true, ...OPTS });
    expect(liveIds(docPath)).toEqual(['design/insight-capture']);

    // Unarchive locates the row by identity (metadata column 1) and restores it
    // at its declared-order position (impl sorts after design).
    runUnarchive(docPath, { id: 'impl/execution-engine', apply: true, ...OPTS });
    expect(liveIds(docPath)).toEqual(['design/insight-capture', 'impl/execution-engine']);
    expect(readLedger(readFileSync(archivePath, 'utf8'))).toEqual([]);
  });
});
