// AUDIT-20260622-16 (RED first) — `findGrammarComments` must honor the SAME fence
// closeability contract as `rewriteEdgeLine` (the other consumer of `fenceDelimiter`).
// The scanner tracked only the fence CHAR (`fenceDelimiterChar`), dropping `length`
// and `closeable`, so an inner ``` example nested in an outer ```` fence — or an
// info-string line like ```typescript — wrongly closed the open fence. A
// `<!-- doc-grammar: … -->` opener documented as an EXAMPLE inside such a fence was
// then misread as a real declaration (false ambiguity / false grammar selection),
// while the document's REAL declaration after the fence was swallowed as in-fence.
// This mirrors tests/roadmap/rewrite-fence-aware.test.ts for the second consumer.
// Watched to FAIL while the scanner ignores length + closeability.

import { describe, it, expect } from 'vitest';
import { findGrammarComments } from '../../src/document-model/chrome.js';

describe('AUDIT-20260622-16 — findGrammarComments honors the fence closeability contract', () => {
  it('an info-string fence line (```typescript) inside an open fence does NOT close it', () => {
    const lines = [
      '# Doc',
      '```',
      'an inner opener with an info string (NOT a valid closer):',
      '```typescript',
      '<!-- doc-grammar: fenced-example -->',
      '```',
      '<!-- doc-grammar: the-real-one -->',
    ];
    const found = findGrammarComments(lines);
    // The in-fence example is NOT a declaration; only the real one after the fence is.
    expect(found.map((g) => g.grammarText)).toEqual(['the-real-one']);
  });

  it('an inner ``` example nested in an outer ```` fence does NOT close the outer fence', () => {
    const lines = [
      '# Doc',
      '````',
      'documenting nested fences:',
      '```',
      '<!-- doc-grammar: inner-example -->',
      '```',
      '<!-- doc-grammar: still-inside-outer -->',
      '````',
      '<!-- doc-grammar: the-real-one -->',
    ];
    const found = findGrammarComments(lines);
    // Everything between the OUTER ```` fences is example prose; only the real
    // declaration after the outer fence closes is detected.
    expect(found.map((g) => g.grammarText)).toEqual(['the-real-one']);
  });

  it('a bare closing fence of sufficient run length still closes (no false in-fence suppression)', () => {
    const lines = [
      '# Doc',
      '```',
      'example body',
      '```',
      '<!-- doc-grammar: real -->',
    ];
    const found = findGrammarComments(lines);
    expect(found.map((g) => g.grammarText)).toEqual(['real']);
  });
});
