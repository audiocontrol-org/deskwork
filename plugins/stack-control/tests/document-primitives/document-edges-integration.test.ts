// T012 (RED-first, 006) — loadDocument populates Unit.edges and runs the edge
// integrity checks on load: a dangling references:'unit' edge fails loud
// (FR-005), and a cycle over an acyclic edge-type fails loud (FR-006). So every
// consumer (curate/archive/roadmap) loads a referentially-sound, acyclic doc.

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
  const dir = mkdtempSync(join(tmpdir(), 'doc-edges-'));
  const docPath = join(dir, 'ROADMAP.md');
  const src = ['---', 'doc-grammar: roadmap', '---', '', '# roadmap', '', ...bodyLines, ''].join('\n');
  writeFileSync(docPath, src, 'utf8');
  return docPath;
}

describe('loadDocument edge wiring (T012)', () => {
  it('populates Unit.edges for a sound document', () => {
    const docPath = writeDoc([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/b',
      '- status: planned',
      '- depends-on: design:feature/a',
    ]);
    const { doc } = loadDocument(docPath, OPTS);
    const b = doc.units.find((u) => u.identifier === 'impl:feature/b')!;
    expect(b.edges).toContainEqual({ field: 'depends-on', targets: ['design:feature/a'] });
  });

  it('fails loud on a dangling depends-on target (FR-005)', () => {
    const docPath = writeDoc([
      '## impl:feature/b',
      '- status: planned',
      '- depends-on: design:feature/ghost',
    ]);
    expect(() => loadDocument(docPath, OPTS)).toThrow(DocumentModelError);
    expect(() => loadDocument(docPath, OPTS)).toThrow(/design:feature\/ghost/);
  });

  it('fails loud on a depends-on cycle (FR-006)', () => {
    const docPath = writeDoc([
      '## impl:feature/a',
      '- status: planned',
      '- depends-on: impl:feature/b',
      '',
      '## impl:feature/b',
      '- status: planned',
      '- depends-on: impl:feature/a',
    ]);
    expect(() => loadDocument(docPath, OPTS)).toThrow(/cycle/i);
  });
});
