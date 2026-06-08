// AUDIT-20260608-52 (MEDIUM, edge correctness) — row-keyed archive helpers only
// handled pipe tables with a LEADING (and trailing) outer pipe. markdown-it also
// accepts "optional-edge" pipe tables: rows WITHOUT a leading/trailing pipe, e.g.
// `a | b | c`. The old `tableCells` did `cells.slice(1, cells.length - 1)`, which
// assumes BOTH outer pipes exist; for an edge-less row it wrongly dropped the
// first and last real cells, mis-indexing identifier/status.
//
// The live-parse side (block-stream `collectRowCells`) derives cells from
// markdown-it's parsed td tokens, so it is already edge-agnostic and correct.
// This test pins the archive-scan side (`tableCells`, applied to RAW archive
// lines): an outer empty segment is dropped ONLY when the row actually had a
// leading/trailing pipe. The escaped-pipe behavior (AUDIT-47) must not regress.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { loadDocument, archivePathFor } from '../../src/document-model/document.js';
import { tableCells, archiveMarkerIds, archiveTableHeaderCells } from '../../src/document-model/archive-file.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const OPTS = { now: '2026-06-08T00:00:00.000Z', builtinGrammarDir: BUILTIN };

function tmp(body: string, name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'optional-edge-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath };
}

const ids = (p: string): string[] => loadDocument(p, OPTS).doc.units.map((u) => u.identifier);

// An edge-less roadmap table: no leading/trailing pipes on header, separator, or
// data rows. markdown-it accepts this; the live parse must still see the same
// cells, and the archive scan must index the identifier from column 0.
const ROADMAP_EDGELESS = (rows: string[]) =>
  [
    '---',
    'doc-grammar: roadmap',
    '---',
    '',
    '# Roadmap',
    '',
    'Codename | Feature | Scope | Status',
    '---|---|---|---',
    ...rows,
    '',
  ].join('\n');

describe('AUDIT-20260608-52 — optional-edge pipe tables', () => {
  describe('tableCells handles all four edge combinations', () => {
    it('strips both outer empties when both edge pipes present: `| a | b |`', () => {
      expect(tableCells('| a | b |')).toEqual(['a', 'b']);
    });
    it('keeps both cells when no edge pipes: `a | b`', () => {
      expect(tableCells('a | b')).toEqual(['a', 'b']);
    });
    it('strips only the trailing empty when only trailing pipe: `a | b |`', () => {
      expect(tableCells('a | b |')).toEqual(['a', 'b']);
    });
    it('strips only the leading empty when only leading pipe: `| a | b`', () => {
      expect(tableCells('| a | b')).toEqual(['a', 'b']);
    });
    it('tolerates surrounding whitespace before deciding edges', () => {
      expect(tableCells('  | a | b |  ')).toEqual(['a', 'b']);
      expect(tableCells('  a | b  ')).toEqual(['a', 'b']);
    });
  });

  it('escaped-pipe behavior (AUDIT-47) is preserved with edges', () => {
    const cells = tableCells('| impl/x | a \\| b | c | shipped |');
    expect(cells).toEqual(['impl/x', 'a | b', 'c', 'shipped']);
    expect(cells.length).toBe(4);
  });

  it('escaped-pipe behavior is preserved WITHOUT edges', () => {
    const cells = tableCells('impl/x | a \\| b | c | shipped');
    expect(cells).toEqual(['impl/x', 'a | b', 'c', 'shipped']);
    expect(cells.length).toBe(4);
  });

  it('live parse handles an edge-less roadmap table (markdown-it is edge-agnostic)', () => {
    const { docPath } = tmp(
      ROADMAP_EDGELESS(['impl/edgeless | Feat | a thing | shipped']),
      'ROADMAP.md',
    );
    // The live side (block-stream collectRowCells over markdown-it td tokens)
    // already reads the edge-less table; identifier parses from column 0.
    expect(ids(docPath)).toEqual(['impl/edgeless']);
  });

  it('archive-scan reads an edge-less archive table: header + marker ids', () => {
    const { docPath } = tmp(
      ROADMAP_EDGELESS(['impl/edgeless | Feat | a thing | shipped']),
      'ROADMAP.md',
    );
    const grammar = loadDocument(docPath, OPTS).doc.grammar;

    // Archive the shipped row; the archive reproduces the live (edge-less) table
    // verbatim — header + separator + the lifted data row, all WITHOUT outer
    // pipes. The archive-scan side must read it correctly despite no leading `|`.
    runArchive(docPath, { apply: true, ...OPTS });
    expect(ids(docPath)).toEqual([]); // live: header + separator remain, no Units

    const archiveSource = readFileSync(archivePathFor(docPath), 'utf8');

    // Before the AUDIT-52 fix the scan loops gated on `startsWith('|')`, so an
    // edge-less archive table surfaced NO header cells and NO marker ids. With
    // the fix the identifier column (0) is read correctly from the edge-less row.
    expect(archiveTableHeaderCells(archiveSource)).toEqual([
      'Codename',
      'Feature',
      'Scope',
      'Status',
    ]);
    expect(archiveMarkerIds(archiveSource, grammar)).toEqual(['impl/edgeless']);
  });

  // NOTE (AUDIT-52 residual, out of scope for this fix): the FULL archive →
  // unarchive round-trip for an edge-less table also requires the unarchive
  // locator (unarchive-engine.ts) to stop gating row detection on
  // `startsWith('|')` — the same edge-blindness, in a file this finding's fix is
  // scoped to NOT touch. The archive-scan side (archive-file.ts) is now
  // edge-agnostic; the unarchive-side gate is a sibling defect tracked
  // separately. The block-stream live side needed NO change (markdown-it td
  // tokens are inherently edge-agnostic — confirmed above).
});
