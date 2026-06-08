// AUDIT-20260608-33 (RED-first) — archive tidiness: liveWithout must not leave
// a double-blank gap where a middle Unit was cut. The archive primitive's job is
// to keep the live document lean; cutting a heading-keyed Unit from the MIDDLE
// of a document must not accrete whitespace drift (the blank that preceded the
// heading + the blank that followed the body collapsing into a double blank).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const NOW = '2026-06-08T00:00:00.000Z';

function tmpDoc(body: string, name = 'INBOX.md'): { docPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'archive-tidiness-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { docPath };
}

// Alpha (captured), Beta (promoted), Gamma (captured) — each separated by a
// SINGLE blank line. Archiving --apply moves Beta from the MIDDLE.
const INBOX = [
  '---',
  'doc-grammar: design-inbox',
  '---',
  '',
  '# Inbox',
  '',
  '### Alpha',
  '- **Status:** **captured** (live)',
  '',
  '### Beta',
  '- **Status:** **promoted** → roadmap',
  '',
  '### Gamma',
  '- **Status:** **captured**',
  '',
].join('\n');

describe('archive engine — tidiness (AUDIT-20260608-33)', () => {
  it('cutting a middle Unit does not leave a double-blank gap', () => {
    const { docPath } = tmpDoc(INBOX);
    const result = runArchive(docPath, { apply: true, now: NOW, builtinGrammarDir: BUILTIN });
    expect(result.moves.map((m) => m.identifier)).toEqual(['Beta']);

    const live = readFileSync(docPath, 'utf8');
    // Beta is gone; the surrounding Units remain.
    expect(live).not.toContain('### Beta');
    expect(live).toContain('### Alpha');
    expect(live).toContain('### Gamma');

    // No double-blank gap where Beta was: a triple-newline run is the signature
    // of two consecutive blank lines accreting at the cut boundary.
    expect(live).not.toMatch(/\n\n\n/);
  });
});
