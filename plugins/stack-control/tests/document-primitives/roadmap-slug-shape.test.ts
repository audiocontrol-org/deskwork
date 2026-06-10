// AUDIT-20260608-37 (RED-first) — the roadmap grammar DECLARES identifier shape
// `<phase>/<slug>` (metadata `identifier.kind: slug`), but the PEG accepted ANY
// text in the identifier column and derived phase via `id.split('/')[0]`. A
// malformed codename like a bare `impl` (no `/`, no slug) slipped through: it
// cleared the universal invariants AND ordering, governing as a legitimate Unit
// despite not being a `<phase>/<slug>` codename.
//
// Per FR-005 the ENGINE enforces only the universal PROPERTIES and does NOT
// mandate slug shape; each grammar declares its own concrete identifier
// production. So the roadmap grammar must honor ITS OWN declared `<phase>/<slug>`
// production — a row whose column-0 cell is not of that form is a PARSE FAILURE
// (no Unit produced; the engine fails loud per FR-003).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocument } from '../../src/document-model/document.js';
import { DocumentModelError } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const OPTS = { builtinGrammarDir: BUILTIN };

function writeDoc(rows: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'roadmap-slug-'));
  const docPath = join(dir, 'ROADMAP.md');
  const src = [
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
  writeFileSync(docPath, src, 'utf8');
  return docPath;
}

describe('roadmap grammar — identifier must be `<phase>/<slug>` (AUDIT-20260608-37)', () => {
  it('a bare `impl` codename (no slug, no slash) fails loud — no Unit is produced', () => {
    const docPath = writeDoc(['| impl | Engine | fan-out | planned |']);
    expect(() => loadDocument(docPath, OPTS)).toThrow(DocumentModelError);
    expect(() => loadDocument(docPath, OPTS)).toThrow(/parse/i);
  });

  it('a phase with an empty slug (`impl/`) fails loud', () => {
    const docPath = writeDoc(['| impl/ | Engine | fan-out | planned |']);
    expect(() => loadDocument(docPath, OPTS)).toThrow(DocumentModelError);
  });

  it('an empty phase (`/execution-engine`) fails loud', () => {
    const docPath = writeDoc(['| /execution-engine | Engine | fan-out | planned |']);
    expect(() => loadDocument(docPath, OPTS)).toThrow(DocumentModelError);
  });

  it('a valid `impl/execution-engine` codename parses fine (control)', () => {
    const docPath = writeDoc(['| impl/execution-engine | Engine | fan-out | planned |']);
    const { doc } = loadDocument(docPath, OPTS);
    expect(doc.units.map((u) => u.identifier)).toEqual(['impl/execution-engine']);
    expect(doc.units.map((u) => u.orderValue)).toEqual(['impl']);
    expect(doc.units.map((u) => u.status)).toEqual(['planned']);
  });
});
