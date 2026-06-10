// T014 (RED-first, 006) — the heading-keyed `roadmap` grammar parses a fixture
// into Units with `<phase>:<kind>/<slug>` identifiers + parsed edges; a
// non-conforming `## heading` fails loud; orderValue = the phase segment.

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

function writeDoc(bodyLines: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'roadmap-heading-'));
  const docPath = join(dir, 'ROADMAP.md');
  const src = ['---', 'doc-grammar: roadmap', '---', '', '# stack-control — roadmap', '', 'Intro preamble.', '', ...bodyLines, ''].join('\n');
  writeFileSync(docPath, src, 'utf8');
  return docPath;
}

describe('heading-keyed roadmap grammar (T014)', () => {
  it('parses heading-keyed items into Units with phase/edges', () => {
    const docPath = writeDoc([
      '## design:feature/a',
      '- status: shipped',
      'Scope of a.',
      '',
      '## impl:feature/b',
      '- status: planned',
      '- depends-on: design:feature/a',
      '- spec: specs/002-parallel-execution-engine',
      'Scope of b.',
    ]);
    const { doc } = loadDocument(docPath, OPTS);
    expect(doc.units.map((u) => u.identifier)).toEqual(['design:feature/a', 'impl:feature/b']);
    const b = doc.units.find((u) => u.identifier === 'impl:feature/b')!;
    expect(b.status).toBe('planned');
    expect(b.orderValue).toBe('impl');
    expect(b.edges).toContainEqual({ field: 'depends-on', targets: ['design:feature/a'] });
    expect(b.edges).toContainEqual({ field: 'spec', targets: ['specs/002-parallel-execution-engine'] });
    const a = doc.units.find((u) => u.identifier === 'design:feature/a')!;
    expect(a.orderValue).toBe('design');
  });

  it('fails loud on a non-conforming `## heading` (not a <phase>:<kind>/<slug> identifier)', () => {
    const docPath = writeDoc(['## Just A Heading', '- status: planned', 'Scope.']);
    expect(() => loadDocument(docPath, OPTS)).toThrow(DocumentModelError);
  });

  it('fails loud on a bad phase or kind segment', () => {
    const docPath = writeDoc(['## bogus:feature/x', '- status: planned', 'Scope.']);
    expect(() => loadDocument(docPath, OPTS)).toThrow(DocumentModelError);
  });
});
