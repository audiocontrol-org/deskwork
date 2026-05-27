/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/pattern-handlers/negative-space.test.ts
 *
 * Tests the negative-space pattern handler (Phase 11 G2). The
 * canonical motivating fixture is the KeygroupSummary-shape repro
 * from audiocontrol issue #315 — a file matching the editor-component
 * glob with ZERO canonical-primitive consumers + >= 5 utility-class
 * hits. The handler MUST fire on this shape; it must NOT fire on a
 * sibling that consumes the canonical primitive.
 *
 * Fixture rationale:
 *   - KeygroupSummary repro: file path matches the editor glob; text
 *     contains ZERO `.ac-*` consumers + many utility classes (`flex`,
 *     `grid`, `absolute`, ...).
 *   - Healthy sibling: file path matches the same glob; text DOES
 *     contain at least one `.ac-*` consumer. Must NOT fire.
 *   - Off-glob file: even with the same shape, the file is outside
 *     the expected-adopter set. Must NOT fire (no expectation).
 *
 * The "threshold" knob and the "no secondary signal" branch are
 * covered separately so the handler's two distinct firing rules are
 * both pinned.
 */

import { describe, it, expect } from 'vitest';
import { negativeSpaceHandler } from '../../../../scope-discovery/discovery-agents/pattern-handlers/negative-space.js';
import type { NegativeSpaceEntry } from '../../../../scope-discovery/discovery-agents/pattern-handlers/types.js';
import { makeScan } from './fixtures.js';

const CANONICAL_RE = /\bac-[a-z]+/g;
// Stand-in for utility-class consumption — matches several common
// tailwind-style class names. The test fixtures are constructed to hit
// these >=5 times so the secondary threshold engages.
const UTILITY_RE = /\b(?:flex|grid|inline|absolute|relative|fixed|bg-[a-z0-9-]+|text-[a-z0-9-]+|p-[0-9]+|m-[0-9]+)\b/g;

function keygroupSummaryReproEntry(): NegativeSpaceEntry {
  return {
    type: 'negative-space',
    id: 'editor-component-no-canon',
    description:
      'Editor-summary component that consumes ZERO canonical design-system primitives despite high utility-class usage (KeygroupSummary-shape repro per audiocontrol issue #315).',
    matchGlob: 'modules/*-editor/src/**/*Summary.tsx',
    mustContain: CANONICAL_RE,
    threshold: 5,
    secondaryContains: UTILITY_RE,
  };
}

// The bug-class fixture: a file in the expected-adopter set with zero
// canonical hits + many utility-class hits. This is the shape that
// shipped to audiocontrol production unnoticed for months and
// motivated Phase 11.
function makeKeygroupSummaryFixture(): string {
  return [
    'import { Knob } from "@audiocontrol/foo";',
    'export function KeygroupSummary(props: { name: string }) {',
    '  return (',
    '    <div className="flex absolute bg-slate-50 text-white p-4 m-2">',
    '      <div className="grid relative inline">{props.name}</div>',
    '      <div className="flex fixed">Footer</div>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
}

// Healthy sibling — same glob, but consumes the canonical primitive.
function makeHealthySiblingFixture(): string {
  return [
    'import { Knob } from "@audiocontrol/foo";',
    'export function GoodSummary(props: { name: string }) {',
    '  return (',
    '    <div className="ac-card flex">',
    '      <div className="ac-text-display">{props.name}</div>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
}

describe('negative-space handler — KeygroupSummary repro (#315)', () => {
  it('FIRES on a glob-matched file with zero canonical + >= threshold utility hits', () => {
    const offending = makeScan(
      'modules/keygroup-editor/src/components/KeygroupSummary.tsx',
      makeKeygroupSummaryFixture(),
    );
    const finding = negativeSpaceHandler.apply({
      entry: keygroupSummaryReproEntry(),
      scans: [offending],
    });
    expect(finding.hits).toHaveLength(1);
    const hit = finding.hits[0];
    expect(hit).toBeDefined();
    if (hit === undefined) return;
    expect(hit.file).toBe('modules/keygroup-editor/src/components/KeygroupSummary.tsx');
    expect(finding.provenance).toBe('negative-space');
    // The snippet must convey what was missing + the secondary count.
    expect(hit.snippet).toMatch(/zero canonical hits/);
  });

  it('does NOT fire on a healthy sibling that consumes the canonical primitive', () => {
    const healthy = makeScan(
      'modules/keygroup-editor/src/components/GoodSummary.tsx',
      makeHealthySiblingFixture(),
    );
    const finding = negativeSpaceHandler.apply({
      entry: keygroupSummaryReproEntry(),
      scans: [healthy],
    });
    expect(finding.hits).toEqual([]);
  });

  it('does NOT fire on a file outside the expected-adopter glob (even with zero canonical)', () => {
    const offGlob = makeScan(
      'docs/example.tsx',
      makeKeygroupSummaryFixture(),
    );
    const finding = negativeSpaceHandler.apply({
      entry: keygroupSummaryReproEntry(),
      scans: [offGlob],
    });
    expect(finding.hits).toEqual([]);
  });

  it('does NOT fire when utility hits are below threshold', () => {
    const lowSecondary = makeScan(
      'modules/keygroup-editor/src/components/QuietSummary.tsx',
      [
        'export function QuietSummary() {',
        '  return <div className="flex">empty</div>;', // only 1 utility hit
        '}',
      ].join('\n'),
    );
    const finding = negativeSpaceHandler.apply({
      entry: keygroupSummaryReproEntry(),
      scans: [lowSecondary],
    });
    expect(finding.hits).toEqual([]);
  });

  it('reports glob-matched-files + holdouts metrics', () => {
    const offending = makeScan(
      'modules/keygroup-editor/src/components/KeygroupSummary.tsx',
      makeKeygroupSummaryFixture(),
    );
    const healthy = makeScan(
      'modules/keygroup-editor/src/components/GoodSummary.tsx',
      makeHealthySiblingFixture(),
    );
    const offGlob = makeScan('docs/x.tsx', makeKeygroupSummaryFixture());
    const finding = negativeSpaceHandler.apply({
      entry: keygroupSummaryReproEntry(),
      scans: [offending, healthy, offGlob],
    });
    expect(finding.metrics).toBeDefined();
    expect(finding.metrics?.['glob_matched_files']).toBe(2);
    expect(finding.metrics?.['holdouts']).toBe(1);
  });
});

describe('negative-space handler — variants', () => {
  it('without secondary_contains, every glob-matched file with zero canonical fires', () => {
    const entry: NegativeSpaceEntry = {
      type: 'negative-space',
      id: 'any-summary-without-canon',
      description: 'Any summary with zero canonical hits',
      matchGlob: 'modules/*-editor/src/**/*Summary.tsx',
      mustContain: CANONICAL_RE,
      threshold: 1, // ignored without secondary
    };
    const quiet = makeScan(
      'modules/keygroup-editor/src/components/QuietSummary.tsx',
      'export function QuietSummary() { return <div>empty</div>; }',
    );
    const finding = negativeSpaceHandler.apply({ entry, scans: [quiet] });
    expect(finding.hits).toHaveLength(1);
  });

  it('threshold knob: secondary hits exactly at threshold count fires (>=)', () => {
    const entry: NegativeSpaceEntry = {
      type: 'negative-space',
      id: 'borderline',
      description: 'borderline test',
      matchGlob: 'modules/**/*.tsx',
      mustContain: CANONICAL_RE,
      threshold: 3,
      secondaryContains: UTILITY_RE,
    };
    const exactly = makeScan(
      'modules/x/test.tsx',
      'const a = "flex"; const b = "grid"; const c = "absolute";',
    );
    const finding = negativeSpaceHandler.apply({ entry, scans: [exactly] });
    expect(finding.hits).toHaveLength(1);
  });
});
