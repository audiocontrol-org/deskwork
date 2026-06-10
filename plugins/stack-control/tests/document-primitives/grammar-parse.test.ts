// T010 (RED-first) — grammar compile + parse → typed Units with original spans
// (FR-002/FR-003/FR-010, research risk #3). A malformed grammar AND a parse
// failure both yield a located fail-loud error, never a crash.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBlockStream } from '../../src/document-model/block-stream.js';
import { parseGrammarArtifact } from '../../src/document-model/grammar-resolver.js';
import { parseUnits } from '../../src/document-model/grammar-parse.js';
import { DocumentModelError, type GrammarSpec } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const GRAMMARS = resolve(here, '..', '..', 'grammars');

function inboxGrammar(): GrammarSpec {
  return parseGrammarArtifact(readFileSync(join(GRAMMARS, 'design-inbox.peg'), 'utf8'), 'builtin');
}

const DOC = [
  '# Design Inbox', // 1  preamble
  '', // 2
  'Intro paragraph.', // 3  preamble
  '', // 4
  '### First idea', // 5  Unit A head
  '', // 6
  '- **Surfaced:** today', // 7  body
  '- **Status:** **captured** (awaiting triage)', // 8  body → status captured
  '', // 9
  '### Second idea', // 10 Unit B head
  '', // 11
  '- **Status:** **promoted** → roadmap', // 12 body → status promoted
].join('\n');

function unitsOf(src: string, grammar = inboxGrammar()) {
  const lines = src.split('\n');
  const stream = buildBlockStream(src);
  return parseUnits(grammar, stream, lines);
}

describe('grammar-parse (T010)', () => {
  it('parses a heading-keyed doc into typed Units with correct identity + status', () => {
    const units = unitsOf(DOC);
    expect(units.map((u) => u.identifier)).toEqual(['First idea', 'Second idea']);
    expect(units.map((u) => u.status)).toEqual(['captured', 'promoted']);
    expect(units.map((u) => u.orderValue)).toEqual(['captured', 'promoted']);
  });

  it('maps each Unit span back to its ORIGINAL markdown line range', () => {
    const units = unitsOf(DOC);
    // Unit A: head line 5 through its last body bullet (line 8).
    expect(units[0]!.span).toEqual({ startLine: 5, endLine: 8 });
    // Unit B: head line 10 through line 12.
    expect(units[1]!.span).toEqual({ startLine: 10, endLine: 12 });
    // Body is the verbatim source slice.
    expect(units[0]!.body).toContain('**Status:** **captured**');
  });

  it('a parse failure (shallow heading interleaved in the Unit sequence) fails loud', () => {
    const bad = [
      '### One', // 1
      '- **Status:** **captured**', // 2
      '## Interloper', // 3  shallower heading between Units
      '### Two', // 4
      '- **Status:** **promoted**', // 5
    ].join('\n');
    expect(() => unitsOf(bad)).toThrow(DocumentModelError);
    expect(() => unitsOf(bad)).toThrow(/parse/i);
  });

  it('a malformed grammar yields a clean located error, never a crash', () => {
    const broken: GrammarSpec = { ...inboxGrammar(), pegText: 'document = = =' };
    expect(() => unitsOf(DOC, broken)).toThrow(DocumentModelError);
    expect(() => unitsOf(DOC, broken)).toThrow(/compile/i);
  });

  it('a zero-Unit (all-preamble) document is vacuously well-formed (empty Units)', () => {
    const units = unitsOf('# Title only\n\nNo units here.\n');
    expect(units).toEqual([]);
  });
});

describe('grammar-parse — row-keyed roadmap grammar (T014, integration-first)', () => {
  // The row-keyed roadmap grammar was preserved as `roadmap-legacy.peg` when
  // `roadmap.peg` became heading-keyed (006 T015); this row-keyed engine test
  // exercises the legacy grammar until US6 retires it (T052).
  const roadmap = (): GrammarSpec =>
    parseGrammarArtifact(readFileSync(join(GRAMMARS, 'roadmap-legacy.peg'), 'utf8'), 'builtin');

  const ROADMAP = [
    '# Roadmap', // 1 preamble
    '', // 2
    '| Codename | Feature | Scope | Status |', // 3 THEAD (chrome)
    '|---|---|---|---|', // 4 separator (no token)
    '| design/insight-capture | Capture | one move | planned |', // 5 ROW
    '| impl/execution-engine | Engine | fan-out | shipped |', // 6 ROW
    '', // 7
    'Trailing note.', // 8 postamble
  ].join('\n');

  it('parses table data rows into Units; header + separator are chrome', () => {
    const units = unitsOf(ROADMAP, roadmap());
    expect(units.map((u) => u.identifier)).toEqual([
      'design/insight-capture',
      'impl/execution-engine',
    ]);
    expect(units.map((u) => u.status)).toEqual(['planned', 'shipped']);
    // orderValue is the phase parsed from the identifier (FR-004 order key).
    expect(units.map((u) => u.orderValue)).toEqual(['design', 'impl']);
  });

  it('declares a reconciliation hook (FR-013b) the engine records but never runs', () => {
    expect(roadmap().reconciliationHook).toEqual({ kind: 'glob', source: 'specs/*/spec.md' });
  });
});
