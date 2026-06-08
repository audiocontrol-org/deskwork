// T018 (RED-first) — the unarchive engine (FR-007, SC-007/SC-004).
// Restores a named Unit at its declared-order position, removes its ledger
// entry, round-trip restores content + identity; a missing/empty ledger or an
// identity collision fails loud with zero writes; dry-run writes nothing.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { runUnarchive } from '../../src/document-model/unarchive-engine.js';
import { loadDocument } from '../../src/document-model/document.js';
import { readLedger } from '../../src/document-model/ledger.js';
import { DocumentModelError } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const NOW = '2026-06-08T00:00:00.000Z';
const OPTS = { now: NOW, builtinGrammarDir: BUILTIN };

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

function tmpDoc(body: string, name = 'INBOX.md') {
  const dir = mkdtempSync(join(tmpdir(), 'unarchive-engine-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath, archivePath: join(dir, name.replace(/\.md$/, '-archive.md')) };
}

function liveIds(docPath: string): string[] {
  return loadDocument(docPath, OPTS).doc.units.map((u) => u.identifier);
}

describe('unarchive engine (T018)', () => {
  it('round-trips a Unit back to the live document at its declared-order position', () => {
    const { docPath, archivePath } = tmpDoc(INBOX);
    runArchive(docPath, { apply: true, ...OPTS });
    expect(liveIds(docPath)).toEqual(['Active idea', 'Another active']);

    const result = runUnarchive(docPath, { id: 'Shipped idea', apply: true, ...OPTS });
    expect(result.applied).toBe(true);

    // Restored, identity intact, at its declared-order position: `promoted`
    // (rank 1) sorts after both `captured` (rank 0) Units.
    expect(liveIds(docPath)).toEqual(['Active idea', 'Another active', 'Shipped idea']);
    const live = readFileSync(docPath, 'utf8');
    expect(live).toContain('### Shipped idea');
    expect(live).toContain('**promoted**');

    // Removed from the archive + its ledger entry gone (FR-007).
    const archive = readFileSync(archivePath, 'utf8');
    expect(archive).not.toContain('### Shipped idea');
    expect(readLedger(archive)).toEqual([]);
  });

  it('dry-run reports the planned restore and writes nothing', () => {
    const { docPath, archivePath } = tmpDoc(INBOX);
    runArchive(docPath, { apply: true, ...OPTS });
    const archiveBefore = readFileSync(archivePath, 'utf8');
    const liveBefore = readFileSync(docPath, 'utf8');

    const result = runUnarchive(docPath, { id: 'Shipped idea', apply: false, ...OPTS });
    expect(result.applied).toBe(false);
    expect(result.moves.map((m) => m.identifier)).toEqual(['Shipped idea']);
    expect(readFileSync(docPath, 'utf8')).toBe(liveBefore);
    expect(readFileSync(archivePath, 'utf8')).toBe(archiveBefore);
  });

  it('an id not in the ledger fails loud with zero writes (locate failure)', () => {
    const { docPath, archivePath } = tmpDoc(INBOX);
    runArchive(docPath, { apply: true, ...OPTS });
    const archiveBefore = readFileSync(archivePath, 'utf8');
    expect(() => runUnarchive(docPath, { id: 'Nonexistent', apply: true, ...OPTS })).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(archivePath, 'utf8')).toBe(archiveBefore);
  });

  it('a missing/empty ledger (no archive) fails loud (locate failure, FR-007)', () => {
    const { docPath } = tmpDoc(INBOX);
    // No archive exists yet → nothing to locate.
    expect(() => runUnarchive(docPath, { id: 'Shipped idea', apply: true, ...OPTS })).toThrow(
      /locate|ledger|not found in the archive/i,
    );
  });

  it('an identity collision (id already live) fails loud with zero writes', () => {
    // Archive "Shipped idea", then re-author a live Unit with the same title →
    // the document ∪ ledger uniqueness is violated, so unarchive cannot proceed.
    const { docPath, archivePath } = tmpDoc(INBOX);
    runArchive(docPath, { apply: true, ...OPTS });
    const live = readFileSync(docPath, 'utf8');
    writeFileSync(docPath, `${live}\n### Shipped idea\n- **Status:** **captured**\n`, 'utf8');
    const archiveBefore = readFileSync(archivePath, 'utf8');
    expect(() => runUnarchive(docPath, { id: 'Shipped idea', apply: true, ...OPTS })).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(archivePath, 'utf8')).toBe(archiveBefore);
  });
});

describe('unarchive engine — row-keyed (T018, roadmap)', () => {
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

  it('restores an archived row into the live table at its declared-order position', () => {
    const { docPath, archivePath } = tmpDoc(ROADMAP, 'ROADMAP.md');
    runArchive(docPath, { apply: true, ...OPTS }); // archives impl/execution-engine (shipped)
    expect(liveIds(docPath)).toEqual(['design/insight-capture']);

    runUnarchive(docPath, { id: 'impl/execution-engine', apply: true, ...OPTS });
    // phase order [design, plan, impl, multi]: impl sorts after design.
    expect(liveIds(docPath)).toEqual(['design/insight-capture', 'impl/execution-engine']);
    expect(readLedger(readFileSync(archivePath, 'utf8'))).toEqual([]);
  });
});
