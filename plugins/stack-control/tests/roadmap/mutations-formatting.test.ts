// AUDIT-20260608-06 — formatting-stability pin for the `reassemble` path
// (decompose/reclassify). `reassemble` cuts each Unit by its span (heading
// through last body block — blank lines between units fall OUTSIDE the span)
// and rejoins unit bodies with exactly one blank line ('\n\n'). The pre-existing
// decompose/reclassify suites verify CONTENT (via loadRoadmap) and the zero-write
// FAILURE path (readFileSync === before) but never assert the WRITTEN BYTES'
// inter-unit spacing. This file pins that spacing is stable across repeated
// mutations: it never accumulates (no run of 3+ newlines appears) and units stay
// separated by exactly one blank line — so slow whitespace drift on the live
// ROADMAP.md (one extra blank line per decompose/reclassify pass) can't go
// unnoticed.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { add, decompose, reclassify } from '../../src/roadmap/mutations.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

/** Count occurrences of a run of three-or-more consecutive newlines (= a 2+ blank-line gap). */
function tripleNewlineRuns(text: string): number {
  return (text.match(/\n{3,}/g) ?? []).length;
}

/**
 * Count the blank-line gaps that sit BETWEEN consecutive `## ` unit headings —
 * i.e. the inter-unit separations. Each value is how many blank lines separate
 * a unit's last content line from the next unit's heading. Stable spacing means
 * every value is exactly 1.
 */
function interUnitBlankCounts(text: string): number[] {
  const lines = text.split('\n');
  const headingIdx: number[] = [];
  lines.forEach((line, i) => {
    if (/^##\s/.test(line)) headingIdx.push(i);
  });
  const gaps: number[] = [];
  for (let h = 1; h < headingIdx.length; h++) {
    let blanks = 0;
    for (let i = headingIdx[h]! - 1; i >= 0 && lines[i]!.trim() === ''; i--) blanks++;
    gaps.push(blanks);
  }
  return gaps;
}

describe('mutations reassemble formatting stability (AUDIT-20260608-06)', () => {
  it('reclassify keeps exactly one blank line between units and does not accumulate across passes', () => {
    const docPath = writeTempRoadmap([
      '## impl:gap/a',
      '- status: planned',
      '',
      '## impl:gap/b',
      '- status: planned',
      '- depends-on: impl:gap/a',
      '',
      '## impl:gap/c',
      '- status: planned',
      '- depends-on: impl:gap/b',
    ]);

    // First reassemble-path mutation: rename a → a2 (and repoint b's edge).
    reclassify(docPath, 'impl:gap/a', 'impl:gap/a2', ROADMAP_OPTS, true);
    const afterFirst = readFileSync(docPath, 'utf8');
    expect(tripleNewlineRuns(afterFirst)).toBe(0);
    expect(interUnitBlankCounts(afterFirst)).toEqual([1, 1]);

    // Second pass on a DIFFERENT unit, then a third pass renaming a2 back to a.
    reclassify(docPath, 'impl:gap/c', 'impl:gap/c2', ROADMAP_OPTS, true);
    reclassify(docPath, 'impl:gap/a2', 'impl:gap/a', ROADMAP_OPTS, true);
    const afterThird = readFileSync(docPath, 'utf8');

    // Spacing did NOT accumulate: still no 2+ blank-line gaps, still exactly one
    // blank line between every pair of units.
    expect(tripleNewlineRuns(afterThird)).toBe(0);
    expect(interUnitBlankCounts(afterThird)).toEqual([1, 1]);

    // And the document still loads green with the expected content after the
    // repeated mutations.
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('impl:gap/a')).toBe(true);
    expect(model.byId.has('impl:gap/c2')).toBe(true);
    expect(model.byId.has('impl:gap/a2')).toBe(false);
    expect(model.byId.get('impl:gap/b')!.dependsOn).toEqual(['impl:gap/a']);
  });

  it('decompose keeps one-blank-line separation and does not drift when re-run on its output', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a',
      '',
      '## multi:feature/d',
      '- status: planned',
      '- depends-on: impl:feature/x',
    ]);

    decompose(docPath, 'impl:feature/x', ['impl:feature/x1', 'impl:feature/x2'], ROADMAP_OPTS, true);
    const afterFirst = readFileSync(docPath, 'utf8');
    expect(tripleNewlineRuns(afterFirst)).toBe(0);
    // 4 units now (a, x1, x2, d) → 3 inter-unit gaps, each exactly one blank line.
    expect(interUnitBlankCounts(afterFirst)).toEqual([1, 1, 1]);

    // Re-run the reassemble path on the already-mutated document: split a part.
    decompose(
      docPath,
      'impl:feature/x1',
      ['impl:feature/x1a', 'impl:feature/x1b'],
      ROADMAP_OPTS,
      true,
    );
    const afterSecond = readFileSync(docPath, 'utf8');
    expect(tripleNewlineRuns(afterSecond)).toBe(0);
    // 5 units now → 4 gaps, each still exactly one blank line (no growth).
    expect(interUnitBlankCounts(afterSecond)).toEqual([1, 1, 1, 1]);

    // Still loads green with correct content after the second pass.
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('impl:feature/x')).toBe(false);
    expect(model.byId.has('impl:feature/x1')).toBe(false);
    expect(model.byId.has('impl:feature/x1a')).toBe(true);
    expect(model.byId.has('impl:feature/x1b')).toBe(true);
    expect(model.byId.get('multi:feature/d')!.dependsOn).toEqual([
      'impl:feature/x1a',
      'impl:feature/x1b',
      'impl:feature/x2',
    ]);
  });
});

describe('mutations add formatting stability (AUDIT-20260608-11)', () => {
  it('add keeps exactly one blank line between units and does not accumulate across repeated adds', () => {
    const docPath = writeTempRoadmap([
      '## impl:gap/a',
      '- status: planned',
      '',
      '## impl:gap/b',
      '- status: planned',
      '- depends-on: impl:gap/a',
    ]);

    // `add` is the most frequent mutation the SKILL prescribes (capture emergent
    // work in one move) — run repeatedly against the live ROADMAP.md. Each pass
    // must leave exactly one blank line of inter-unit separation and must not
    // accumulate blank lines anywhere (no run of 3+ newlines).
    add(docPath, { identifier: 'impl:gap/c', status: 'planned' }, ROADMAP_OPTS, true);
    const afterFirst = readFileSync(docPath, 'utf8');
    expect(tripleNewlineRuns(afterFirst)).toBe(0);
    expect(interUnitBlankCounts(afterFirst)).toEqual([1, 1]);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.has('impl:gap/c')).toBe(true);

    add(docPath, { identifier: 'impl:gap/d', status: 'planned' }, ROADMAP_OPTS, true);
    const afterSecond = readFileSync(docPath, 'utf8');
    expect(tripleNewlineRuns(afterSecond)).toBe(0);
    expect(interUnitBlankCounts(afterSecond)).toEqual([1, 1, 1]);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.has('impl:gap/d')).toBe(true);

    add(docPath, { identifier: 'impl:gap/e', status: 'planned' }, ROADMAP_OPTS, true);
    const afterThird = readFileSync(docPath, 'utf8');
    // No blank-line growth anywhere across the three repeated adds.
    expect(tripleNewlineRuns(afterThird)).toBe(0);
    expect(interUnitBlankCounts(afterThird)).toEqual([1, 1, 1, 1]);

    // Still loads green with every added unit present after the repeated mutations.
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('impl:gap/a')).toBe(true);
    expect(model.byId.has('impl:gap/b')).toBe(true);
    expect(model.byId.has('impl:gap/c')).toBe(true);
    expect(model.byId.has('impl:gap/d')).toBe(true);
    expect(model.byId.has('impl:gap/e')).toBe(true);
  });
});
