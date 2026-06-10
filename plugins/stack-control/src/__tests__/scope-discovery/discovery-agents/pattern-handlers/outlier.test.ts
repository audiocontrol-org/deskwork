/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/pattern-handlers/outlier.test.ts
 *
 * Statistical-outlier handler tests (Phase 11 G4). The handler
 * computes cosine distance from each file to the centroid of its
 * directory-siblings and flags files whose z-score exceeds the
 * configured sigma threshold.
 *
 * Fixture rationale: 3 sibling files with near-identical token /
 * className composition + 1 dramatically different sibling. The
 * different file's z-score must exceed 2σ (the default), and only it
 * fires.
 */

import { describe, it, expect } from 'vitest';
import { outlierHandler } from '../../../../scope-discovery/discovery-agents/pattern-handlers/outlier.js';
import type { OutlierEntry } from '../../../../scope-discovery/discovery-agents/pattern-handlers/types.js';
import { makeScan, TEST_CATALOG_PROVENANCE, TEST_CATALOG_STATUS } from './fixtures.js';

function classNameOutlierEntry(): OutlierEntry {
  return {
    type: 'outlier',
    id: 'classname-outlier-per-dir',
    description: 'Files whose className composition diverges from siblings',
    matchGlob: 'modules/**/*.tsx',
    distanceMetric: 'className-composition',
    thresholdSigma: 1.5,
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
  };
}

describe('outlier handler — className-composition', () => {
  it('FIRES on the file whose className composition diverges from siblings', () => {
    // Three near-identical siblings (use the canonical primitive)…
    const sib1 = makeScan(
      'modules/keygroup-editor/src/A.tsx',
      'export const A = () => <div className="ac-card ac-text-display">A</div>;',
    );
    const sib2 = makeScan(
      'modules/keygroup-editor/src/B.tsx',
      'export const B = () => <div className="ac-card ac-text-display">B</div>;',
    );
    const sib3 = makeScan(
      'modules/keygroup-editor/src/C.tsx',
      'export const C = () => <div className="ac-card ac-text-display">C</div>;',
    );
    // …and one outlier (uses utility classes only).
    const outlier = makeScan(
      'modules/keygroup-editor/src/D.tsx',
      'export const D = () => <div className="flex grid absolute bg-slate-100 p-4 m-2">D</div>;',
    );
    const finding = outlierHandler.apply({
      entry: classNameOutlierEntry(),
      scans: [sib1, sib2, sib3, outlier],
    });
    const hitFiles = finding.hits.map((h) => h.file);
    expect(hitFiles).toContain('modules/keygroup-editor/src/D.tsx');
    expect(hitFiles).not.toContain('modules/keygroup-editor/src/A.tsx');
    expect(finding.provenance).toBe('outlier');
  });

  it('does NOT fire when all siblings have identical composition (stddev = 0)', () => {
    const sib1 = makeScan(
      'modules/keygroup-editor/src/A.tsx',
      'export const A = () => <div className="ac-card">A</div>;',
    );
    const sib2 = makeScan(
      'modules/keygroup-editor/src/B.tsx',
      'export const B = () => <div className="ac-card">B</div>;',
    );
    const sib3 = makeScan(
      'modules/keygroup-editor/src/C.tsx',
      'export const C = () => <div className="ac-card">C</div>;',
    );
    const finding = outlierHandler.apply({
      entry: classNameOutlierEntry(),
      scans: [sib1, sib2, sib3],
    });
    expect(finding.hits).toEqual([]);
  });

  it('reports buckets_analyzed + files_scored + outliers metrics', () => {
    const sib1 = makeScan(
      'modules/keygroup-editor/src/A.tsx',
      'export const A = () => <div className="ac-card">A</div>;',
    );
    const sib2 = makeScan(
      'modules/keygroup-editor/src/B.tsx',
      'export const B = () => <div className="ac-card">B</div>;',
    );
    const outlier = makeScan(
      'modules/keygroup-editor/src/D.tsx',
      'export const D = () => <div className="flex grid absolute p-4 m-2 bg-slate-100">D</div>;',
    );
    const finding = outlierHandler.apply({
      entry: classNameOutlierEntry(),
      scans: [sib1, sib2, outlier],
    });
    expect(finding.metrics).toBeDefined();
    expect(finding.metrics?.['buckets_analyzed']).toBe(1);
    expect(finding.metrics?.['files_scored']).toBe(3);
    expect(finding.metrics?.['threshold_sigma']).toBe(1.5);
  });

  it('skips directories with fewer than 2 sibling files (no population to compare)', () => {
    const lone = makeScan(
      'modules/lone-editor/src/Lonely.tsx',
      'export const Lonely = () => <div className="flex grid">x</div>;',
    );
    const finding = outlierHandler.apply({
      entry: classNameOutlierEntry(),
      scans: [lone],
    });
    expect(finding.hits).toEqual([]);
    expect(finding.metrics?.['files_scored']).toBe(1);
  });

  it('token-composition metric: outlier with unique vocabulary fires', () => {
    const entry: OutlierEntry = {
      type: 'outlier',
      id: 'token-outlier',
      description: 'token outlier',
      matchGlob: 'modules/**/*.tsx',
      distanceMetric: 'token-composition',
      thresholdSigma: 1.0,
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const sib1 = makeScan(
      'modules/x/src/A.tsx',
      'import { foo, bar } from "x"; export const A = foo(bar);',
    );
    const sib2 = makeScan(
      'modules/x/src/B.tsx',
      'import { foo, bar } from "x"; export const B = foo(bar);',
    );
    const sib3 = makeScan(
      'modules/x/src/C.tsx',
      'import { foo, bar } from "x"; export const C = foo(bar);',
    );
    const outlier = makeScan(
      'modules/x/src/Z.tsx',
      'class Wholly Different Quux Plonk Frobnicate Schmoo Quux Plonk Frobnicate Schmoo;',
    );
    const finding = outlierHandler.apply({ entry, scans: [sib1, sib2, sib3, outlier] });
    const hitFiles = finding.hits.map((h) => h.file);
    expect(hitFiles).toContain('modules/x/src/Z.tsx');
  });
});
