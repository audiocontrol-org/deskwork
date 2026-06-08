// T006 (RED-first) — the load-bearing block→source line-range round-trip
// (research risk #1). For an N-block document, every block entry's normalized
// span must map back to the EXACT original markdown line range, across the
// block kinds markdown-it splits/merges unexpectedly: setext headings, fenced
// code with internal blank lines, loose lists, tables, HTML blocks. An
// off-by-one here makes every archive cut wrong.

import { describe, it, expect } from 'vitest';
import { buildBlockStream } from '../../src/document-model/block-stream.js';
import type { BlockEntry } from '../../src/document-model/types.js';

const SRC = [
  'Setext Title', // 1
  '============', // 2
  '', // 3
  '## ATX head', // 4
  '', // 5
  'Para line one', // 6
  'continued.', // 7
  '', // 8
  '- loose item a', // 9
  '', // 10
  '- loose item b', // 11
  '', // 12
  '```', // 13
  'code', // 14
  '', // 15
  'more code', // 16
  '```', // 17
  '', // 18
  '| A | B |', // 19
  '|---|---|', // 20
  '| x | y |', // 21
  '| p | q |', // 22
  '', // 23
  '<div>', // 24
  'html block', // 25
  '</div>', // 26
].join('\n');

const LINES = SRC.split('\n');

function sourceOf(e: BlockEntry): string {
  return LINES.slice(e.span.startLine - 1, e.span.endLine).join('\n');
}

describe('block-stream round-trip (T006)', () => {
  const stream = buildBlockStream(SRC);
  const entries = stream.entries;

  it('peggy line-index aligns: one normalized line per entry, in order', () => {
    expect(stream.normalized.split('\n').length).toBe(entries.length);
    // Spans are monotonically non-decreasing (document order).
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]!.span.startLine).toBeGreaterThanOrEqual(
        entries[i - 1]!.span.startLine,
      );
    }
  });

  it('setext heading spans BOTH the title and underline lines', () => {
    const h = entries.find((e) => e.kind === 'H1');
    expect(h).toBeDefined();
    expect(h!.text).toBe('Setext Title');
    expect(h!.span).toEqual({ startLine: 1, endLine: 2 });
    expect(sourceOf(h!)).toBe('Setext Title\n============');
  });

  it('ATX heading spans its single line, level from the marker', () => {
    const h = entries.find((e) => e.kind === 'H2');
    expect(h!.text).toBe('ATX head');
    expect(h!.span).toEqual({ startLine: 4, endLine: 4 });
  });

  it('multi-line paragraph spans all its lines', () => {
    const p = entries.find((e) => e.kind === 'P' && e.text.startsWith('Para'));
    expect(p!.span).toEqual({ startLine: 6, endLine: 7 });
    expect(sourceOf(p!)).toBe('Para line one\ncontinued.');
  });

  it('loose-list items map to their own source lines', () => {
    const a = entries.find((e) => e.kind === 'P' && e.text.includes('loose item a'));
    const b = entries.find((e) => e.kind === 'P' && e.text.includes('loose item b'));
    expect(a!.span).toEqual({ startLine: 9, endLine: 9 });
    expect(b!.span).toEqual({ startLine: 11, endLine: 11 });
  });

  it('fenced code includes internal blank lines in its span', () => {
    const code = entries.find((e) => e.kind === 'CODE');
    expect(code!.span).toEqual({ startLine: 13, endLine: 17 });
    expect(sourceOf(code!)).toBe('```\ncode\n\nmore code\n```');
  });

  it('table header and data rows each map to their single source line', () => {
    const thead = entries.find((e) => e.kind === 'THEAD');
    const rows = entries.filter((e) => e.kind === 'ROW');
    expect(thead!.span).toEqual({ startLine: 19, endLine: 19 });
    expect(rows.map((r) => r.span)).toEqual([
      { startLine: 21, endLine: 21 },
      { startLine: 22, endLine: 22 },
    ]);
    // Cells are \x1f-joined so the grammar can address columns by position.
    expect(rows[0]!.text.split('\x1f')).toEqual(['x', 'y']);
    expect(thead!.text.split('\x1f')).toEqual(['A', 'B']);
  });

  it('HTML block maps to its full source line range', () => {
    const last = entries[entries.length - 1]!;
    expect(sourceOf(last)).toBe('<div>\nhtml block\n</div>');
  });
});
