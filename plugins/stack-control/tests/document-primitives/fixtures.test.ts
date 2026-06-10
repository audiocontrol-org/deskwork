// T003 — the committed canonical fixtures behave as labelled: the governable
// one loads; the ungovernable / parse-failing / ordinal-identifier ones each
// fail loud (FR-001/FR-003/FR-005/FR-010).

import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocument } from '../../src/document-model/document.js';
import { DocumentModelError } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, 'fixtures');
const OPTS = { builtinGrammarDir: resolve(here, '..', '..', 'grammars') };
const load = (name: string) => loadDocument(resolve(FIX, name), OPTS);

describe('canonical fixtures (T003)', () => {
  it('governable.md loads into Units', () => {
    expect(load('governable.md').doc.units.map((u) => u.identifier)).toEqual([
      'A captured idea',
      'A promoted idea',
    ]);
  });

  it('ungovernable.md fails loud (not governable)', () => {
    expect(() => load('ungovernable.md')).toThrow(/not governable/i);
  });

  it('parse-failing.md fails loud (shallow heading interleaved in the Unit sequence)', () => {
    expect(() => load('parse-failing.md')).toThrow(DocumentModelError);
  });

  it('ordinal-id.md fails loud (positional/sequence identifier)', () => {
    expect(() => load('ordinal-id.md')).toThrow(/positional|F3/i);
  });
});
