// Phase 8 (T044–T050) — the spec-governance GOVERN_OVERRIDE deferred findings,
// each pinned RED-first. Implementation-mechanism-altitude edges, not spec gaps.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { runUnarchive } from '../../src/document-model/unarchive-engine.js';
import { runCurate } from '../../src/document-model/curate-engine.js';
import { loadDocument } from '../../src/document-model/document.js';
import { withLedger } from '../../src/document-model/ledger.js';
import { DocumentModelError } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const OPTS = { now: '2026-06-08T00:00:00.000Z', builtinGrammarDir: BUILTIN };

function tmp(body: string, name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'deferred-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath, archivePath: join(dir, name.replace(/\.md$/, '-archive.md')) };
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

describe('T044 / AUDIT-06 — unarchive into a live doc with ZERO live Units (genuine bug)', () => {
  it('heading-keyed: archive the only entry, then unarchive it back', () => {
    const { docPath } = tmp(
      ['---', 'doc-grammar: design-inbox', '---', '', '### Only one', '- **Status:** **promoted**', ''].join('\n'),
      'INBOX.md',
    );
    runArchive(docPath, { apply: true, ...OPTS });
    expect(ids(docPath)).toEqual([]); // zero live Units
    runUnarchive(docPath, { id: 'Only one', apply: true, ...OPTS });
    expect(ids(docPath)).toEqual(['Only one']);
  });

  it('row-keyed: archive the only row (header+separator remain), then unarchive it back', () => {
    const { docPath } = tmp(ROADMAP(['| impl/only | Only | x | shipped |']), 'ROADMAP.md');
    runArchive(docPath, { apply: true, ...OPTS });
    expect(ids(docPath)).toEqual([]); // zero live Units; table head remains as chrome
    runUnarchive(docPath, { id: 'impl/only', apply: true, ...OPTS });
    expect(ids(docPath)).toEqual(['impl/only']);
  });
});

describe('T045 / AUDIT-02 — order-key value outside the declared relation → fail loud (FR-004)', () => {
  it('curate fails loud naming the out-of-domain order value', () => {
    const { docPath } = tmp(
      ROADMAP(['| bogus/x | X | y | planned |', '| design/y | Y | z | planned |']),
      'ROADMAP.md',
    );
    expect(() => runCurate(docPath, { apply: false, ...OPTS })).toThrow(DocumentModelError);
    expect(() => runCurate(docPath, { apply: false, ...OPTS })).toThrow(/bogus|outside the declared relation/i);
  });
});

describe('T046 / AUDIT-03 — unarchive into a NOT-well-ordered live doc does not reorder the rest', () => {
  it('inserts at the declared-order position relative to current neighbors only', () => {
    // Disordered live (Zeta before Alpha, both captured) after archiving a
    // promoted entry; unarchive places it without reordering the rest.
    const { docPath } = tmp(
      [
        '---',
        'doc-grammar: design-inbox',
        '---',
        '',
        '### Zeta',
        '- **Status:** **captured**',
        '',
        '### Alpha',
        '- **Status:** **captured**',
        '',
        '### Done',
        '- **Status:** **promoted**',
        '',
      ].join('\n'),
      'INBOX.md',
    );
    runArchive(docPath, { apply: true, ...OPTS }); // moves Done
    expect(ids(docPath)).toEqual(['Zeta', 'Alpha']); // still disordered
    runUnarchive(docPath, { id: 'Done', apply: true, ...OPTS });
    // Done (promoted) appends after both captured; the captured pair stays
    // disordered — unarchive does not reorder.
    expect(ids(docPath)).toEqual(['Zeta', 'Alpha', 'Done']);
  });
});

describe('T047 / AUDIT-05 — manual archive-marker edit surfaces as a curate coherence NOTICE', () => {
  it('a marker the ledger does not know about is reported (not fail-loud)', () => {
    const { docPath, archivePath } = tmp(
      ['---', 'doc-grammar: design-inbox', '---', '', '### Live', '- **Status:** **captured**', '', '### Done', '- **Status:** **promoted**', ''].join('\n'),
      'INBOX.md',
    );
    runArchive(docPath, { apply: true, ...OPTS });
    // Manually rename the archived marker (ledger still says "Done").
    const archive = readFileSync(archivePath, 'utf8').replace('### Done', '### DoneRenamed');
    writeFileSync(archivePath, archive, 'utf8');

    const report = runCurate(docPath, { apply: false, ...OPTS });
    const notices = report.findings.filter((f) => f.kind === 'coherence-notice');
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.some((n) => n.message.includes('Done') || n.message.includes('DoneRenamed'))).toBe(true);
  });
});

describe('T048 / AUDIT-04 — row-keyed archive under a column-schema change fails loud', () => {
  it('appending a live row whose column count differs from the archive table → fail loud', () => {
    const { docPath, archivePath } = tmp(
      ROADMAP(['| impl/a | A | x | shipped |', '| design/b | B | y | planned |']),
      'ROADMAP.md',
    );
    runArchive(docPath, { apply: true, ...OPTS }); // archives impl/a → 4-col archive table
    expect(existsSync(archivePath)).toBe(true);

    // Rewrite the live doc with a TRAILING extra column (status stays at col 3,
    // so the live doc still parses cleanly) and flip design/b to shipped. The
    // 5-col live table now disagrees with the 4-col archive table — appending
    // would silently misalign it, so the run must fail loud (AUDIT-04).
    writeFileSync(
      docPath,
      [
        '---',
        'doc-grammar: roadmap-legacy',
        '---',
        '',
        '# Roadmap',
        '',
        '| Codename | Feature | Scope | Status | Notes |',
        '|---|---|---|---|---|',
        '| design/b | B | y | shipped | later |',
        '',
      ].join('\n'),
      'utf8',
    );
    expect(() => runArchive(docPath, { apply: true, ...OPTS })).toThrow(/column-schema mismatch/i);
  });
});

describe('T049 / AUDIT-07+08 — locate failure is zero-write; coherence NOTICE is the divergence surface', () => {
  it('unarchive locate failure writes nothing to either file (FR-007/FR-010)', () => {
    const { docPath, archivePath } = tmp(
      ['---', 'doc-grammar: design-inbox', '---', '', '### Live', '- **Status:** **captured**', '', '### Done', '- **Status:** **promoted**', ''].join('\n'),
      'INBOX.md',
    );
    runArchive(docPath, { apply: true, ...OPTS });
    const liveBefore = readFileSync(docPath, 'utf8');
    const archiveBefore = readFileSync(archivePath, 'utf8');
    expect(() => runUnarchive(docPath, { id: 'Ghost', apply: true, ...OPTS })).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(liveBefore);
    expect(readFileSync(archivePath, 'utf8')).toBe(archiveBefore);
  });

  it('a ledger/archive divergence is a curate NOTICE (exit-equivalent: never fail-loud)', () => {
    const { docPath, archivePath } = tmp(
      ['---', 'doc-grammar: design-inbox', '---', '', '### Live', '- **Status:** **captured**', '', '### Done', '- **Status:** **promoted**', ''].join('\n'),
      'INBOX.md',
    );
    runArchive(docPath, { apply: true, ...OPTS });
    // Drop the ledger entry while leaving the marker → divergence.
    writeFileSync(archivePath, withLedger(readFileSync(archivePath, 'utf8'), []), 'utf8');
    const report = runCurate(docPath, { apply: false, ...OPTS });
    expect(report.findings.some((f) => f.kind === 'coherence-notice')).toBe(true);
  });
});

describe('T050 / AUDIT-22 — row-keyed table header + separator are chrome, not Units', () => {
  it('the roadmap header row never parses as a Unit', () => {
    const { docPath } = tmp(ROADMAP(['| design/x | X | s | planned |']), 'ROADMAP.md');
    const got = ids(docPath);
    expect(got).toEqual(['design/x']);
    expect(got).not.toContain('Codename');
  });
});
