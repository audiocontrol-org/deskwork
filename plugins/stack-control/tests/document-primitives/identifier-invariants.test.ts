// T032/T033 (RED-first) — identifier invariants enforced END-TO-END at the verb
// boundary (FR-005/FR-010, SC-004). An ordinal-looking identifier fails loud
// naming it; identifiers are byte-for-byte stable across a curate reorder AND
// an archive→unarchive round-trip.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { runUnarchive } from '../../src/document-model/unarchive-engine.js';
import { runCurate } from '../../src/document-model/curate-engine.js';
import { loadDocument } from '../../src/document-model/document.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const OPTS = { now: '2026-06-08T00:00:00.000Z', builtinGrammarDir: BUILTIN };

function tmpDoc(body: string, name = 'INBOX.md') {
  const dir = mkdtempSync(join(tmpdir(), 'id-invariants-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { docPath };
}

const ids = (docPath: string): string[] => loadDocument(docPath, OPTS).doc.units.map((u) => u.identifier);

describe('ordinal identifier rejected end-to-end at the verb boundary (T032)', () => {
  it.each(['F3', '2', 'phase-2'])('verb fails loud (exit 2) naming the ordinal identifier %s', (bad) => {
    const { docPath } = tmpDoc(
      ['---', 'doc-grammar: design-inbox', '---', '', `### ${bad}`, '- **Status:** **captured**', ''].join('\n'),
    );
    const r = runCli(['curate', '--doc', docPath]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(bad);
  });
});

describe('identity stability (T033, SC-004)', () => {
  const DISORDERED = [
    '---',
    'doc-grammar: design-inbox',
    '---',
    '',
    '### Zeta idea',
    '- **Status:** **captured**',
    '',
    '### Alpha idea',
    '- **Status:** **captured**',
    '',
  ].join('\n');

  it('identifiers are byte-for-byte unchanged across a curate reorder', () => {
    const { docPath } = tmpDoc(DISORDERED);
    const before = new Set(ids(docPath));
    runCurate(docPath, { apply: true, ...OPTS });
    const after = ids(docPath);
    expect(new Set(after)).toEqual(before);
    expect(after).toEqual(['Alpha idea', 'Zeta idea']); // reordered, same identities
  });

  it('identifier is unchanged across an archive→unarchive round-trip', () => {
    const { docPath } = tmpDoc(
      [
        '---',
        'doc-grammar: design-inbox',
        '---',
        '',
        '### Live one',
        '- **Status:** **captured**',
        '',
        '### Done one',
        '- **Status:** **promoted**',
        '',
      ].join('\n'),
    );
    runArchive(docPath, { apply: true, ...OPTS });
    runUnarchive(docPath, { id: 'Done one', apply: true, ...OPTS });
    expect(ids(docPath)).toContain('Done one'); // identity intact after round-trip
  });
});
