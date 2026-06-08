// AUDIT-20260608-47 (MEDIUM, edge correctness) — naive table-cell splitting
// breaks row-keyed archive round-trips for a cell containing an ESCAPED pipe.
//
// A markdown table cell may contain `\|`, which renders as a literal `|` in the
// cell. markdown-it unescapes `\|` → `|` in inline content, so block-stream's
// `collectRowCells` yields the literal pipe inside ONE cell. The archive-scan
// helper `tableCells` operates on RAW archive lines (which still carry the `\|`
// escape) and must therefore split on UNESCAPED `|` only AND unescape `\|` → `|`
// so both sides agree on cell boundaries and content. A naive `split('|')`
// mis-counts columns, corrupting identifier/status column indexing.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { runUnarchive } from '../../src/document-model/unarchive-engine.js';
import { loadDocument } from '../../src/document-model/document.js';
import { tableCells } from '../../src/document-model/archive-file.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const OPTS = { now: '2026-06-08T00:00:00.000Z', builtinGrammarDir: BUILTIN };

function tmp(body: string, name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'escaped-pipe-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath };
}

const ids = (p: string): string[] => loadDocument(p, OPTS).doc.units.map((u) => u.identifier);

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

describe('AUDIT-20260608-47 — escaped pipe within a non-identifier cell', () => {
  it('tableCells keeps an escaped pipe inside one cell and unescapes it', () => {
    // Raw archive line shape: the Scope column holds `a \| b` (one cell).
    const cells = tableCells('| impl/x | Feat | a \\| b | shipped |');
    expect(cells).toEqual(['impl/x', 'Feat', 'a | b', 'shipped']);
    // Column count is correct (4) — the escaped pipe did NOT add a column.
    expect(cells.length).toBe(4);
  });

  it('row-keyed archive round-trip preserves the escaped-pipe cell and column indexing', () => {
    const { docPath } = tmp(
      ROADMAP(['| impl/x | Feat | a \\| b | shipped |']),
      'ROADMAP.md',
    );

    // Identifier must parse as `impl/x` even though a later column holds a pipe.
    expect(ids(docPath)).toEqual(['impl/x']);

    runArchive(docPath, { apply: true, ...OPTS });
    expect(ids(docPath)).toEqual([]); // archived; header+separator remain

    runUnarchive(docPath, { id: 'impl/x', apply: true, ...OPTS });
    expect(ids(docPath)).toEqual(['impl/x']);

    // The round-trip restored the row with the literal pipe intact.
    const restored = readFileSync(docPath, 'utf8');
    expect(restored).toContain('a \\| b');
  });
});
