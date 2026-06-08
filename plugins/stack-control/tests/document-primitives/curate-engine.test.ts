// T025–T028 (RED-first) — the curate engine (FR-008, SC-002).
//   T025 well-formed: parse/identifier failure fails loud; no partial fix.
//   T026 well-ordered: report disorder; --apply reorders to the declared order
//        WITHOUT changing any identity.
//   T027 properly-archived: flag terminal-status Units still live; --apply
//        composes archive.
//   T028 up-to-date seam: a declared reconciliation hook is reported
//        "declared, not yet executed" and NEVER run; an absent hook is silent;
//        the other checks still run either way.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCurate } from '../../src/document-model/curate-engine.js';
import { loadDocument } from '../../src/document-model/document.js';
import { readLedger } from '../../src/document-model/ledger.js';
import { DocumentModelError } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const NOW = '2026-06-08T00:00:00.000Z';
const OPTS = { now: NOW, builtinGrammarDir: BUILTIN };

function tmpDoc(body: string, name = 'INBOX.md') {
  const dir = mkdtempSync(join(tmpdir(), 'curate-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath, archivePath: join(dir, name.replace(/\.md$/, '-archive.md')) };
}

function liveIds(docPath: string): string[] {
  return loadDocument(docPath, OPTS).doc.units.map((u) => u.identifier);
}

describe('curate — well-formed (T025)', () => {
  it('an identifier-invariant violation fails loud and applies no partial fix', () => {
    const bad = ['---', 'doc-grammar: design-inbox', '---', '', '### F3', '- **Status:** **captured**', ''].join('\n');
    const { docPath } = tmpDoc(bad);
    const before = readFileSync(docPath, 'utf8');
    expect(() => runCurate(docPath, { apply: true, ...OPTS })).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before); // no partial fix
  });
});

describe('curate — well-ordered (T026)', () => {
  // Two `captured` entries out of identifier order → disorder (tie-break by
  // identifier within equal status rank).
  const DISORDERED = [
    '---',
    'doc-grammar: design-inbox',
    '---',
    '',
    '# Inbox',
    '',
    '### Zeta idea',
    '- **Status:** **captured**',
    '',
    '### Alpha idea',
    '- **Status:** **captured**',
    '',
  ].join('\n');

  it('reports disorder in dry-run and writes nothing', () => {
    const { docPath } = tmpDoc(DISORDERED);
    const before = readFileSync(docPath, 'utf8');
    const report = runCurate(docPath, { apply: false, ...OPTS });
    expect(report.findings.some((f) => f.kind === 'disorder')).toBe(true);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('--apply reorders to the declared order without changing any identity', () => {
    const { docPath } = tmpDoc(DISORDERED);
    const report = runCurate(docPath, { apply: true, ...OPTS });
    expect(report.reordered).toBe(true);
    expect(liveIds(docPath)).toEqual(['Alpha idea', 'Zeta idea']);
    // Bodies preserved (identity + content intact).
    expect(readFileSync(docPath, 'utf8')).toContain('### Alpha idea');
    expect(readFileSync(docPath, 'utf8')).toContain('### Zeta idea');
  });
});

describe('curate — properly-archived (T027)', () => {
  const WITH_TERMINAL = [
    '---',
    'doc-grammar: design-inbox',
    '---',
    '',
    '# Inbox',
    '',
    '### Alpha idea',
    '- **Status:** **captured**',
    '',
    '### Done idea',
    '- **Status:** **promoted**',
    '',
  ].join('\n');

  it('flags a terminal-status Unit still live in dry-run', () => {
    const { docPath } = tmpDoc(WITH_TERMINAL);
    const report = runCurate(docPath, { apply: false, ...OPTS });
    expect(report.findings.some((f) => f.kind === 'unarchived-terminal' && f.message.includes('Done idea'))).toBe(true);
  });

  it('--apply composes archive — terminal Unit moves to the archive', () => {
    const { docPath, archivePath } = tmpDoc(WITH_TERMINAL);
    const report = runCurate(docPath, { apply: true, ...OPTS });
    expect(report.archived.map((m) => m.identifier)).toEqual(['Done idea']);
    expect(liveIds(docPath)).toEqual(['Alpha idea']);
    expect(existsSync(archivePath)).toBe(true);
    expect(readLedger(readFileSync(archivePath, 'utf8')).map((e) => e.identifier)).toEqual(['Done idea']);
  });
});

describe('curate — up-to-date seam (T028)', () => {
  const ROADMAP = [
    '---',
    'doc-grammar: roadmap',
    '---',
    '',
    '# Roadmap',
    '',
    '| Codename | Feature | Scope | Status |',
    '|---|---|---|---|',
    '| design/insight-capture | Capture | one move | planned |',
    '',
  ].join('\n');

  const INBOX_NO_HOOK = [
    '---',
    'doc-grammar: design-inbox',
    '---',
    '',
    '### Alpha idea',
    '- **Status:** **captured**',
    '',
  ].join('\n');

  it('reports a declared reconciliation hook as "declared, not yet executed" and never runs it', () => {
    const { docPath } = tmpDoc(ROADMAP, 'ROADMAP.md');
    const report = runCurate(docPath, { apply: false, ...OPTS });
    const seam = report.findings.find((f) => f.kind === 'up-to-date-seam');
    expect(seam).toBeDefined();
    expect(seam!.message).toMatch(/declared, not (yet )?executed/i);
  });

  it('is silent about the seam when no hook is declared, but still runs the other checks', () => {
    const { docPath } = tmpDoc(INBOX_NO_HOOK);
    const report = runCurate(docPath, { apply: false, ...OPTS });
    expect(report.findings.some((f) => f.kind === 'up-to-date-seam')).toBe(false);
    // Other checks ran (a clean single-entry doc → no disorder/terminal findings).
    expect(report.findings.filter((f) => f.kind === 'disorder')).toEqual([]);
  });
});
