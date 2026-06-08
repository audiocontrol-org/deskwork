// T015–T017 (RED-first) — the archive engine (FR-006/FR-009/FR-010, SC-001).
//   T015 dry-run: select terminal Units, report planned moves, ZERO writes.
//   T016 --apply: cut by span → append to <doc>-archive.md; ledger IN the
//        archive file; live doc has zero archivable Units and zero bookkeeping;
//        coherence holds.
//   T017 durability: a VALIDATION failure on --apply writes NOTHING to either
//        file (FR-010 absolute zero-writes for validation failures); and an
//        interrupted apply lands content in the archive before removing it from
//        the live doc, so nothing is silently lost (FR-006/FR-010 scoped
//        durability promise — the canonical spec, superseding the stale
//        "two-file atomicity" wording in the task line).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { readLedger } from '../../src/document-model/ledger.js';
import { DocumentModelError } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const NOW = '2026-06-08T00:00:00.000Z';

function tmpDoc(body: string, name = 'INBOX.md'): { docPath: string; archivePath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'archive-engine-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { docPath, archivePath: join(dir, name.replace(/\.md$/, '-archive.md')) };
}

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
  '### Shipped idea',
  '- **Status:** **promoted** → roadmap',
  '',
  '### Another active',
  '- **Status:** **captured**',
  '',
].join('\n');

describe('archive engine — dry-run (T015)', () => {
  it('selects terminal-status Units, reports planned moves, writes nothing', () => {
    const { docPath, archivePath } = tmpDoc(INBOX);
    const before = readFileSync(docPath, 'utf8');
    const result = runArchive(docPath, { apply: false, now: NOW, builtinGrammarDir: BUILTIN });
    expect(result.applied).toBe(false);
    expect(result.moves.map((m) => m.identifier)).toEqual(['Shipped idea']);
    expect(readFileSync(docPath, 'utf8')).toBe(before); // live untouched
    expect(existsSync(archivePath)).toBe(false); // no archive created
  });
});

describe('archive engine — apply (T016)', () => {
  it('moves terminal Units to the archive with an in-archive ledger; live keeps only active Units', () => {
    const { docPath, archivePath } = tmpDoc(INBOX);
    const result = runArchive(docPath, { apply: true, now: NOW, builtinGrammarDir: BUILTIN });
    expect(result.applied).toBe(true);
    expect(result.moves.map((m) => m.identifier)).toEqual(['Shipped idea']);

    const live = readFileSync(docPath, 'utf8');
    expect(live).not.toContain('### Shipped idea');
    expect(live).toContain('### Active idea');
    expect(live).toContain('### Another active');
    // The live document carries ZERO archive bookkeeping (ledger lives elsewhere).
    expect(live).not.toContain('ledger');
    expect(live).not.toContain('archivedAt');

    expect(existsSync(archivePath)).toBe(true);
    const archive = readFileSync(archivePath, 'utf8');
    expect(archive).toContain('### Shipped idea');
    expect(archive).toContain('**promoted**');

    // Ledger lives in the archive file, keyed by identifier (FR-006).
    const ledger = readLedger(archive);
    expect(ledger.map((e) => e.identifier)).toEqual(['Shipped idea']);
    expect(ledger[0]!.fromStatus).toBe('promoted');
    expect(ledger[0]!.archivedAt).toBe(NOW);
  });

  it('re-running apply when nothing is archivable is a no-op move list', () => {
    const { docPath } = tmpDoc(INBOX);
    runArchive(docPath, { apply: true, now: NOW, builtinGrammarDir: BUILTIN });
    const second = runArchive(docPath, { apply: true, now: NOW, builtinGrammarDir: BUILTIN });
    expect(second.moves).toEqual([]);
  });
});

describe('archive engine — durability (T017)', () => {
  it('a validation failure on --apply writes NOTHING to either file (absolute zero-writes)', () => {
    // An ordinal identifier (`### F3`) is an FR-005 violation → fail loud BEFORE
    // any write; neither the live doc nor an archive file may be touched.
    const bad = [
      '---',
      'doc-grammar: design-inbox',
      '---',
      '',
      '### F3',
      '- **Status:** **promoted**',
      '',
    ].join('\n');
    const { docPath, archivePath } = tmpDoc(bad);
    const before = readFileSync(docPath, 'utf8');
    expect(() => runArchive(docPath, { apply: true, now: NOW, builtinGrammarDir: BUILTIN })).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(docPath, 'utf8')).toBe(before);
    expect(existsSync(archivePath)).toBe(false);
  });

  it('an interrupted apply lands content in the archive before removing it from live (no silent loss)', () => {
    // Simulate interruption: make the LIVE path unwritable (a directory at its
    // location can't be overwritten with writeFileSync). The archive is written
    // first, so the moved Unit survives in the archive even though the live
    // rewrite fails — content is recoverable, never silently lost.
    const dir = mkdtempSync(join(tmpdir(), 'archive-interrupt-'));
    const docPath = join(dir, 'INBOX.md');
    const archivePath = join(dir, 'INBOX-archive.md');
    writeFileSync(docPath, INBOX, 'utf8');
    // Replace the live file with a directory of the same name AFTER load reads
    // it — emulated by an injected post-archive write failure hook.
    expect(() =>
      runArchive(docPath, {
        apply: true,
        now: NOW,
        builtinGrammarDir: BUILTIN,
        // Test-only injection: throw right after the archive file is written,
        // before the live document is rewritten.
        afterArchiveWriteHook: () => {
          throw new Error('simulated interruption');
        },
      }),
    ).toThrow(/interruption/);
    // The moved Unit is in the archive (not lost); the live doc is unchanged.
    expect(existsSync(archivePath)).toBe(true);
    expect(readFileSync(archivePath, 'utf8')).toContain('### Shipped idea');
    expect(readFileSync(docPath, 'utf8')).toContain('### Shipped idea');
    void statSync; // keep import used across node versions
  });
});

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
  '| multi/front-door | Front door | thin CLI | shipped |',
  '',
].join('\n');

describe('archive engine — row-keyed container (T016, roadmap)', () => {
  it('reproduces the live header + separator as the archived-Unit table and appends shipped rows', () => {
    const { docPath, archivePath } = tmpDoc(ROADMAP, 'ROADMAP.md');
    const result = runArchive(docPath, { apply: true, now: NOW, builtinGrammarDir: BUILTIN });
    expect(result.moves.map((m) => m.identifier)).toEqual([
      'impl/execution-engine',
      'multi/front-door',
    ]);

    const live = readFileSync(docPath, 'utf8');
    expect(live).toContain('design/insight-capture'); // planned row stays
    expect(live).not.toContain('impl/execution-engine');
    expect(live).not.toContain('multi/front-door');

    const archive = readFileSync(archivePath, 'utf8');
    // The archive table reproduces the live header + separator + column schema.
    expect(archive).toContain('| Codename | Feature | Scope | Status |');
    expect(archive).toContain('|---|---|---|---|');
    expect(archive).toContain('| impl/execution-engine | Engine | fan-out | shipped |');
    const ledger = readLedger(archive);
    expect(ledger.map((e) => e.identifier)).toEqual(['impl/execution-engine', 'multi/front-door']);
  });
});
