// T004 (RED-first, 006) — the grammar resolver parses an `edgeFields` metadata
// block into GrammarSpec.edgeFields; absence ⇒ [] (backward-compatible with
// design-inbox). Invalid `references` / non-boolean flags fail loud.

import { describe, it, expect } from 'vitest';
import { parseGrammarArtifact } from '../../src/document-model/grammar-resolver.js';
import { DocumentModelError } from '../../src/document-model/types.js';

function artifact(metaExtra: string): string {
  return [
    '---',
    'id: g',
    'unit:',
    '  kind: heading',
    '  level: 2',
    'statusVocabulary: [planned, shipped]',
    'terminalStatuses: [shipped]',
    'orderKey:',
    '  field: phase',
    '  relation: [design, impl]',
    'identifier:',
    '  kind: slug',
    metaExtra,
    '---',
    'start = .*',
  ]
    .filter((l) => l.length > 0)
    .join('\n');
}

describe('grammar-resolver edgeFields (T004)', () => {
  it('parses a declared edgeFields block', () => {
    const text = artifact(
      [
        'edgeFields:',
        '  - { name: depends-on,     references: unit,     acyclic: true,  blocking: true  }',
        '  - { name: part-of,        references: unit,     acyclic: true,  blocking: false }',
        '  - { name: deferred-until, references: prose,    acyclic: false, blocking: true  }',
        '  - { name: spec,           references: external, acyclic: false, blocking: false }',
      ].join('\n'),
    );
    const g = parseGrammarArtifact(text, 'builtin');
    expect(g.edgeFields).toHaveLength(4);
    expect(g.edgeFields[0]).toEqual({
      name: 'depends-on',
      references: 'unit',
      acyclic: true,
      blocking: true,
    });
    expect(g.edgeFields[2]).toEqual({
      name: 'deferred-until',
      references: 'prose',
      acyclic: false,
      blocking: true,
    });
  });

  it('absent edgeFields ⇒ [] (backward-compatible)', () => {
    const g = parseGrammarArtifact(artifact(''), 'builtin');
    expect(g.edgeFields).toEqual([]);
  });

  it('rejects an invalid references value', () => {
    const text = artifact('edgeFields:\n  - { name: x, references: bogus, acyclic: false, blocking: false }');
    expect(() => parseGrammarArtifact(text, 'builtin')).toThrow(DocumentModelError);
    expect(() => parseGrammarArtifact(text, 'builtin')).toThrow(/references/i);
  });

  it('rejects a non-boolean acyclic flag', () => {
    const text = artifact('edgeFields:\n  - { name: x, references: unit, acyclic: maybe, blocking: false }');
    expect(() => parseGrammarArtifact(text, 'builtin')).toThrow(/acyclic/i);
  });

  it('rejects an edge field with a missing name', () => {
    const text = artifact('edgeFields:\n  - { references: unit, acyclic: true, blocking: true }');
    expect(() => parseGrammarArtifact(text, 'builtin')).toThrow(/name/i);
  });
});
