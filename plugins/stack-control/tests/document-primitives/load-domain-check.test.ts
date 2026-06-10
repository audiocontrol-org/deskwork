// AUDIT-20260608-39 (RED-first) — the FR-004 order-key DOMAIN check must fire at
// LOAD time, not only at curate (reorderedSource) / unarchive (insertIntoLive).
// A Unit whose order value is outside the grammar's declared relation is a
// well-formedness failure (FR-004/FR-003): it MUST fail loud at load so EVERY
// verb (archive — which never reorders — included) refuses it consistently.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocument } from '../../src/document-model/document.js';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { DocumentModelError } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const OPTS = { now: '2026-06-08T00:00:00.000Z', builtinGrammarDir: BUILTIN };

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

function tmpDoc(body: string, name = 'ROADMAP.md') {
  const dir = mkdtempSync(join(tmpdir(), 'load-domain-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath };
}

describe('AUDIT-20260608-39 — out-of-domain order value fails loud at LOAD (FR-004)', () => {
  // `bogus/x` is a valid `<phase>/<slug>` shape, but `bogus` is NOT in the
  // declared relation [design, plan, impl, multi]. It must not load silently.
  const OUT_OF_DOMAIN = ROADMAP(['| bogus/x | X | y | shipped |']);

  it('loadDocument throws DocumentModelError naming the out-of-domain value', () => {
    const { docPath } = tmpDoc(OUT_OF_DOMAIN);
    expect(() => loadDocument(docPath, OPTS)).toThrow(DocumentModelError);
    expect(() => loadDocument(docPath, OPTS)).toThrow(/bogus|outside the declared relation/i);
  });

  it('archive (which never reorders) ALSO fails loud — the consistency point', () => {
    const { docPath } = tmpDoc(OUT_OF_DOMAIN);
    expect(() => runArchive(docPath, { apply: true, ...OPTS })).toThrow(DocumentModelError);
    expect(() => runArchive(docPath, { apply: true, ...OPTS })).toThrow(
      /bogus|outside the declared relation/i,
    );
  });
});
