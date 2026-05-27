/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/pattern-handlers/regex.test.ts
 *
 * Asserts the regex handler preserves pre-Phase-11 behavior. The
 * extraction of `applyPattern` from `pattern-matrix.ts` into the
 * polymorphic dispatcher must not change observable matching, hit
 * counts, snippet shape, or extension-filter semantics.
 *
 * Per testing.md "test edge cases, not just the golden path".
 */

import { describe, it, expect } from 'vitest';
import { regexHandler } from '../../../../scope-discovery/discovery-agents/pattern-handlers/regex.js';
import type { RegexEntry } from '../../../../scope-discovery/discovery-agents/pattern-handlers/types.js';
import { makeScan } from './fixtures.js';

const AS_CAST_REGEX = /\bas\s+(?!const\b|unknown\b)[A-Z][A-Za-z0-9_]*/g;

function asCastEntry(extensions?: ReadonlyArray<string>): RegexEntry {
  return {
    type: 'regex',
    id: 'as-type-cast',
    description: '`as <TypeName>` cast',
    regex: AS_CAST_REGEX,
    ...(extensions !== undefined ? { extensions } : {}),
  };
}

describe('regex handler — preserves legacy behavior', () => {
  it('fires on `as Type` cast and reports file:line snippet', () => {
    const scan = makeScan('src/a.ts', 'const x = obj as Frobnicator;\nconst y = 1;');
    const finding = regexHandler.apply({
      entry: asCastEntry(),
      scans: [scan],
    });
    expect(finding.id).toBe('as-type-cast');
    expect(finding.provenance).toBe('registered-pattern');
    expect(finding.hits).toHaveLength(1);
    const hit = finding.hits[0];
    expect(hit).toBeDefined();
    if (hit === undefined) return;
    expect(hit.file).toBe('src/a.ts');
    expect(hit.line).toBe(1);
    expect(hit.snippet).toBe('const x = obj as Frobnicator;');
  });

  it('does NOT fire on `as const` (legal narrowing exception)', () => {
    const scan = makeScan('src/b.ts', 'const x = [1, 2, 3] as const;');
    const finding = regexHandler.apply({
      entry: asCastEntry(),
      scans: [scan],
    });
    expect(finding.hits).toEqual([]);
  });

  it('does NOT fire on `as unknown` (allowed bridge)', () => {
    const scan = makeScan('src/c.ts', 'const x = something as unknown;');
    const finding = regexHandler.apply({
      entry: asCastEntry(),
      scans: [scan],
    });
    expect(finding.hits).toEqual([]);
  });

  it('respects extensions filter (skips non-matching extensions)', () => {
    const tsScan = makeScan('src/a.ts', 'const x = obj as Frobnicator;');
    const mdScan = makeScan('src/a.md', 'as Frobnicator description');
    const finding = regexHandler.apply({
      entry: asCastEntry(['.ts', '.tsx']),
      scans: [tsScan, mdScan],
    });
    expect(finding.hits.map((h) => h.file)).toEqual(['src/a.ts']);
  });

  it('truncates snippets over the 200-char limit with ellipsis', () => {
    const longLine = `const x = obj as Frobnicator; // ${'x'.repeat(250)}`;
    const scan = makeScan('src/d.ts', longLine);
    const finding = regexHandler.apply({
      entry: asCastEntry(),
      scans: [scan],
    });
    expect(finding.hits).toHaveLength(1);
    const hit = finding.hits[0];
    if (hit === undefined) throw new Error('no hit');
    expect(hit.snippet.length).toBe(200);
    expect(hit.snippet.endsWith('...')).toBe(true);
  });

  it('reports the regex source verbatim for traceability', () => {
    const scan = makeScan('src/e.ts', 'const x = obj as Frobnicator;');
    const finding = regexHandler.apply({
      entry: asCastEntry(),
      scans: [scan],
    });
    expect(finding.regex).toBe(AS_CAST_REGEX.source);
  });

  it('reports one hit per matching line (multi-line file)', () => {
    const scan = makeScan(
      'src/f.ts',
      ['const x = a as Foo;', 'const y = b as Bar;', 'const z = c as Baz;'].join('\n'),
    );
    const finding = regexHandler.apply({
      entry: asCastEntry(),
      scans: [scan],
    });
    expect(finding.hits.map((h) => h.line)).toEqual([1, 2, 3]);
  });
});
