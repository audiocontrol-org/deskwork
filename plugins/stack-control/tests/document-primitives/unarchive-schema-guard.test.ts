// AUDIT-20260608-36 (MEDIUM) — row-keyed unarchive must guard the archived row's
// column count against the CURRENT live table header, symmetric with archive's
// "column-schema mismatch" fail-loud (archive-engine.ts buildArchive). Without
// the guard a 4-column archived row is silently reinserted into a 5-column live
// table, corrupting the table. RED-first.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { runUnarchive } from '../../src/document-model/unarchive-engine.js';
import { DocumentModelError } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const OPTS = { now: '2026-06-08T00:00:00.000Z', builtinGrammarDir: BUILTIN };

function tmp(body: string, name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'unarchive-schema-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath, archivePath: join(dir, name.replace(/\.md$/, '-archive.md')) };
}

const ROADMAP = (rows: string[]) =>
  [
    '---',
    'doc-grammar: roadmap-legacy',
    '---',
    '',
    '# Roadmap',
    '',
    '| Codename | Feature | Scope | Status |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');

describe('AUDIT-20260608-36 — row-keyed unarchive column-schema guard', () => {
  it('fails loud (schema mismatch) + writes nothing when the live table column count differs from the archived row', () => {
    // 4-column roadmap; archive the shipped row → 4-col archived row.
    const { docPath, archivePath } = tmp(
      ROADMAP(['| impl/a | A | x | shipped |', '| design/b | B | y | planned |']),
      'ROADMAP.md',
    );
    runArchive(docPath, { apply: true, ...OPTS }); // archives impl/a (shipped)

    // Rewrite the live doc with a TRAILING extra column (status stays at col 3,
    // so the live doc still parses cleanly) and keep ≥1 live row. The 5-col live
    // table now disagrees with the 4-col archived row — reinserting it would
    // silently misalign the table, so unarchive must fail loud (symmetric with
    // archive's column-schema mismatch).
    const live5 = [
      '---',
      'doc-grammar: roadmap-legacy',
      '---',
      '',
      '# Roadmap',
      '',
      '| Codename | Feature | Scope | Status | Notes |',
      '|---|---|---|---|---|',
      '| design/b | B | y | planned | later |',
      '',
    ].join('\n');
    writeFileSync(docPath, live5, 'utf8');

    const liveBefore = readFileSync(docPath, 'utf8');
    const archiveBefore = readFileSync(archivePath, 'utf8');

    expect(() => runUnarchive(docPath, { id: 'impl/a', apply: true, ...OPTS })).toThrow(
      DocumentModelError,
    );
    expect(() => runUnarchive(docPath, { id: 'impl/a', apply: true, ...OPTS })).toThrow(
      /column-schema mismatch/i,
    );

    // Zero writes to either file (FR-010).
    expect(readFileSync(docPath, 'utf8')).toBe(liveBefore);
    expect(readFileSync(archivePath, 'utf8')).toBe(archiveBefore);
  });
});
