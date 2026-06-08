// AUDIT-20260608-51 (RED-first) — embedded grammar-comment DETECTION must be
// fence-aware.
//
// stack-control documents its own grammar syntax, so a governed document can
// realistically contain, in a Unit body, a FENCED CODE BLOCK showing an EXAMPLE
// `<!-- doc-grammar: ... -->`. `findGrammarComments` scans raw lines for the
// `doc-grammar:` sentinel with no awareness of code fences, so a documented
// example is mis-detected as a real grammar declaration — either overriding the
// document's real grammar or tripping the >1-declaration ambiguity fail-loud.
//
// These cases pin: a `<!-- doc-grammar: ... -->` opener that begins inside a
// fenced code block is NOT a grammar declaration. The fence-skip must NOT break
// the real cases: a genuine embedded declaration still wins, and TWO real
// (non-fenced) declarations still throw ambiguous.

import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGrammar } from '../../src/document-model/grammar-resolver.js';
import { DocumentModelError } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const builtinGrammarDir = resolve(here, '..', '..', 'grammars');

// A minimal valid embedded grammar artifact (metadata + trivial PEG body).
function artifact(id: string): string {
  return [
    '---',
    `id: ${id}`,
    'unit:',
    '  kind: heading',
    '  level: 3',
    'statusVocabulary: [captured, promoted, dropped]',
    'terminalStatuses: [promoted, dropped]',
    'orderKey:',
    '  field: status',
    '  relation: [captured, promoted, dropped]',
    'identifier:',
    '  kind: title',
    'reconciliationHook: null',
    '---',
    'start = .*',
  ].join('\n');
}

describe('AUDIT-20260608-51 — embedded grammar-comment detection is fence-aware', () => {
  it('frontmatter ref wins; an in-FENCE example `<!-- doc-grammar: ... -->` is NOT a declaration', () => {
    const src = [
      '---',
      'doc-grammar: design-inbox',
      '---',
      '',
      '# Inbox',
      '',
      '### How to embed a grammar',
      '- **Status:** **captured**',
      '',
      'You declare an embedded grammar like this:',
      '',
      '```markdown',
      '<!-- doc-grammar: peg',
      'id: example-grammar',
      'unit:',
      '  kind: heading',
      '  level: 3',
      '-->',
      '```',
      '',
    ].join('\n');

    const g = resolveGrammar(src, { builtinGrammarDir });
    // The in-fence example must be ignored: the document resolves to its REAL
    // frontmatter grammar (built-in design-inbox), no override, no ambiguity.
    expect(g.source).toBe('builtin');
    expect(g.id).toBe('design-inbox');
  });

  it('a REAL embedded declaration wins even when an in-FENCE example is also present', () => {
    const src = [
      '<!-- doc-grammar: peg',
      artifact('real-embedded'),
      '-->',
      '',
      '### How to embed a grammar',
      '',
      'Example you would paste:',
      '',
      '~~~',
      '<!-- doc-grammar: peg',
      'id: example-from-docs',
      '-->',
      '~~~',
      '',
      '### A unit',
    ].join('\n');

    const g = resolveGrammar(src, { builtinGrammarDir });
    // Resolves to the REAL embedded declaration, NOT an ambiguity error and NOT
    // the in-fence example.
    expect(g.source).toBe('embedded');
    expect(g.id).toBe('real-embedded');
  });

  it('TWO real (non-fenced) declarations STILL throw ambiguous (fence-skip does not over-suppress)', () => {
    const src = [
      '<!-- doc-grammar: peg',
      artifact('one'),
      '-->',
      '<!-- doc-grammar: peg',
      artifact('two'),
      '-->',
      '### x',
    ].join('\n');

    expect(() => resolveGrammar(src, { builtinGrammarDir })).toThrow(DocumentModelError);
    expect(() => resolveGrammar(src, { builtinGrammarDir })).toThrow(/ambiguous/i);
  });
});
