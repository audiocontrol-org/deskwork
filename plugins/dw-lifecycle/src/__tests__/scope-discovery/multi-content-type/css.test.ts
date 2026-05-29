/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/multi-content-type/css.test.ts
 *
 * Phase 11 Task 13 — CSS content-type support across every pattern
 * primitive in the polymorphic dispatcher:
 *
 *   - regex          (class-name conventions: BEM naming, `!important`)
 *   - negative-space (selectors-without-canonical-namespace)
 *   - coverage       (namespace adoption ratio across CSS files)
 *   - outlier        (token-composition with content_type='css')
 *
 * Tokens for CSS = selectors + property names per the outlier tokenizer.
 */

import { describe, it, expect } from 'vitest';
import { regexHandler } from '../../../scope-discovery/discovery-agents/pattern-handlers/regex.js';
import { negativeSpaceHandler } from '../../../scope-discovery/discovery-agents/pattern-handlers/negative-space.js';
import { coverageHandler } from '../../../scope-discovery/discovery-agents/pattern-handlers/coverage.js';
import { outlierHandler } from '../../../scope-discovery/discovery-agents/pattern-handlers/outlier.js';
import type {
  CoverageEntry,
  NegativeSpaceEntry,
  OutlierEntry,
  RegexEntry,
} from '../../../scope-discovery/discovery-agents/pattern-handlers/types.js';
import {
  makeScan,
  TEST_CATALOG_PROVENANCE,
  TEST_CATALOG_STATUS,
} from '../discovery-agents/pattern-handlers/fixtures.js';

const GOOD_CSS = [
  '.ac-button { color: red; }',
  '.ac-card { background: white; padding: 10px; }',
].join('\n');

const BAD_CSS_IMPORTANT = [
  '.foo { color: red !important; }',
  '.bar { width: 100% !important; }',
].join('\n');

const BAD_CSS_NO_NAMESPACE = [
  '.button { color: red; }',
  '.card { padding: 10px; }',
].join('\n');

describe('Phase 11 Task 13 — css / regex handler', () => {
  it('fires on `!important` overrides (banned in canonical CSS)', () => {
    const entry: RegexEntry = {
      type: 'regex',
      id: 'css-important-override',
      description: '`!important` overrides — banned per project CSS convention.',
      regex: /!important/g,
      extensions: ['.css', '.scss'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const offending = makeScan('src/foo.css', BAD_CSS_IMPORTANT);
    const finding = regexHandler.apply({ entry, scans: [offending] });
    expect(finding.hits.length).toBe(2);
  });

  it('respects extensions filter (skips non-CSS files even with the same text)', () => {
    const entry: RegexEntry = {
      type: 'regex',
      id: 'css-important-override',
      description: '`!important` overrides',
      regex: /!important/g,
      extensions: ['.css', '.scss'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const tsScan = makeScan('src/foo.ts', '// !important is irrelevant');
    const finding = regexHandler.apply({ entry, scans: [tsScan] });
    expect(finding.hits).toEqual([]);
  });
});

describe('Phase 11 Task 13 — css / negative-space handler', () => {
  const entry: NegativeSpaceEntry = {
    type: 'negative-space',
    id: 'css-without-canonical-namespace',
    description:
      'CSS files declaring class selectors without the canonical `.ac-*` namespace prefix.',
    matchGlob: 'src/**/*.css',
    mustContain: /\.ac-[a-z][a-z0-9-]*\s*[\{,]/g,
    threshold: 1,
    secondaryContains: /\.[a-z][a-z0-9-]*\s*\{/g,
    extensions: ['.css'],
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
  };

  it('FIRES on a CSS file with selectors but zero canonical namespace usage', () => {
    const offending = makeScan('src/styles/legacy.css', BAD_CSS_NO_NAMESPACE);
    const finding = negativeSpaceHandler.apply({ entry, scans: [offending] });
    expect(finding.hits).toHaveLength(1);
    expect(finding.provenance).toBe('negative-space');
  });

  it('does NOT fire on healthy CSS that uses the canonical namespace', () => {
    const healthy = makeScan('src/styles/canonical.css', GOOD_CSS);
    const finding = negativeSpaceHandler.apply({ entry, scans: [healthy] });
    expect(finding.hits).toEqual([]);
  });
});

describe('Phase 11 Task 13 — css / coverage handler', () => {
  it('emits adoption ratio for CSS namespace usage', () => {
    const entry: CoverageEntry = {
      type: 'coverage',
      id: 'css-namespace-adoption',
      description: 'Fraction of CSS files using the `.ac-*` namespace.',
      matchGlob: 'src/**/*.css',
      mustContain: /\.ac-[a-z]/g,
      extensions: ['.css'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const a = makeScan('src/styles/sub/a.css', GOOD_CSS);
    const b = makeScan('src/styles/sub/b.css', BAD_CSS_NO_NAMESPACE);
    const c = makeScan('src/styles/sub/c.css', GOOD_CSS);
    const finding = coverageHandler.apply({ entry, scans: [a, b, c] });
    expect(finding.metrics?.['denominator']).toBe(3);
    expect(finding.metrics?.['numerator']).toBe(2);
    const ratio = finding.metrics?.['ratio'] ?? 0;
    expect(ratio).toBeCloseTo(2 / 3, 5);
  });
});

describe('Phase 11 Task 13 — css / outlier handler', () => {
  const entry: OutlierEntry = {
    type: 'outlier',
    id: 'css-property-outlier',
    description:
      'CSS files whose property/selector composition diverges from directory siblings.',
    matchGlob: 'src/styles/**/*.css',
    distanceMetric: 'token-composition',
    thresholdSigma: 1.2,
    contentType: 'css',
    extensions: ['.css'],
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
  };

  it('fires on a CSS file whose property mix diverges from siblings', () => {
    // Three siblings share a property profile (color + padding) with
    // small variance so per-directory stddev is non-zero. The outlier
    // handler skips zero-stddev directories — see outlier.ts.
    const sib1 = makeScan(
      'src/styles/sub/a.css',
      '.ac-a { color: red; padding: 10px; margin: 5px; background: white; }',
    );
    const sib2 = makeScan(
      'src/styles/sub/b.css',
      '.ac-b { color: green; padding: 10px; margin: 5px; border: 1px solid; }',
    );
    const sib3 = makeScan(
      'src/styles/sub/c.css',
      '.ac-c { color: blue; padding: 10px; margin: 5px; line-height: 1.5; }',
    );
    // … and the outlier uses completely different properties.
    const outlier = makeScan(
      'src/styles/sub/d.css',
      '.weird { grid-template-columns: 1fr; flex-direction: column; place-items: center; transform: rotate(45deg); animation: slide 1s; }',
    );
    const finding = outlierHandler.apply({
      entry,
      scans: [sib1, sib2, sib3, outlier],
    });
    expect(finding.provenance).toBe('outlier');
    const flagged = finding.hits.map((h) => h.file);
    expect(flagged).toContain('src/styles/sub/d.css');
    expect(flagged).not.toContain('src/styles/sub/a.css');
  });

  it('content_type="auto" with .scss extension also resolves to css tokenization', () => {
    const autoEntry: OutlierEntry = {
      ...entry,
      contentType: 'auto',
      matchGlob: 'src/**/*.scss',
      extensions: ['.scss'],
    };
    const sib1 = makeScan(
      'src/styles/a.scss',
      '.alpha { color: red; padding: 10px; margin: 5px; background: white; }',
    );
    const sib2 = makeScan(
      'src/styles/b.scss',
      '.beta { color: green; padding: 10px; margin: 5px; border: 1px solid; }',
    );
    const sib3 = makeScan(
      'src/styles/c.scss',
      '.gamma { color: blue; padding: 10px; margin: 5px; line-height: 1.5; }',
    );
    const outlier = makeScan(
      'src/styles/d.scss',
      '.delta { grid-area: foo; transform: skew(10deg); animation: x 1s; filter: blur(2px); will-change: transform; }',
    );
    const finding = outlierHandler.apply({
      entry: autoEntry,
      scans: [sib1, sib2, sib3, outlier],
    });
    expect(finding.hits.map((h) => h.file)).toContain('src/styles/d.scss');
  });
});
