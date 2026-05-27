/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/multi-content-type/html.test.ts
 *
 * Phase 11 Task 13 — HTML content-type support across every pattern
 * primitive in the polymorphic dispatcher:
 *
 *   - regex          (forbidden inline-style attributes)
 *   - negative-space (HTML pages missing canonical wrapper element)
 *   - coverage       (canonical wrapper adoption ratio)
 *   - outlier        (token-composition with content_type='html';
 *                     tokens = tag names + attribute names)
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

const PAGE_WITH_WRAPPER = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '  <body>',
  '    <main class="ac-page">',
  '      <article>Body</article>',
  '    </main>',
  '  </body>',
  '</html>',
].join('\n');

const PAGE_WITHOUT_WRAPPER = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '  <body>',
  '    <article>Body</article>',
  '  </body>',
  '</html>',
].join('\n');

describe('Phase 11 Task 13 — html / regex handler', () => {
  it('fires on inline `style="..."` attributes (forbidden per design system)', () => {
    const entry: RegexEntry = {
      type: 'regex',
      id: 'inline-style-attribute',
      description: 'Inline `style=` attributes — banned per design system.',
      regex: /\sstyle\s*=\s*"/g,
      extensions: ['.html', '.htm'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const offending = makeScan(
      'pages/inline.html',
      '<div style="color: red;">x</div>',
    );
    const finding = regexHandler.apply({ entry, scans: [offending] });
    expect(finding.hits).toHaveLength(1);
  });
});

describe('Phase 11 Task 13 — html / negative-space handler', () => {
  const entry: NegativeSpaceEntry = {
    type: 'negative-space',
    id: 'html-without-canonical-wrapper',
    description:
      'HTML pages under pages/ that lack the canonical `<main class="ac-page">` wrapper element.',
    matchGlob: 'pages/**/*.html',
    mustContain: /<main\s+class="ac-page"/g,
    threshold: 1,
    extensions: ['.html', '.htm'],
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
  };

  it('FIRES on a page missing the canonical wrapper', () => {
    const offending = makeScan('pages/sub/orphan.html', PAGE_WITHOUT_WRAPPER);
    const finding = negativeSpaceHandler.apply({ entry, scans: [offending] });
    expect(finding.hits).toHaveLength(1);
    expect(finding.provenance).toBe('negative-space');
  });

  it('does NOT fire on a page carrying the canonical wrapper', () => {
    const healthy = makeScan('pages/sub/canonical.html', PAGE_WITH_WRAPPER);
    const finding = negativeSpaceHandler.apply({ entry, scans: [healthy] });
    expect(finding.hits).toEqual([]);
  });
});

describe('Phase 11 Task 13 — html / coverage handler', () => {
  it('emits adoption ratio for canonical wrapper usage', () => {
    const entry: CoverageEntry = {
      type: 'coverage',
      id: 'canonical-wrapper-adoption',
      description: 'Fraction of HTML pages using the canonical wrapper.',
      matchGlob: 'pages/**/*.html',
      mustContain: /<main\s+class="ac-page"/g,
      extensions: ['.html', '.htm'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const a = makeScan('pages/sub/a.html', PAGE_WITH_WRAPPER);
    const b = makeScan('pages/sub/b.html', PAGE_WITHOUT_WRAPPER);
    const finding = coverageHandler.apply({ entry, scans: [a, b] });
    expect(finding.metrics?.['denominator']).toBe(2);
    expect(finding.metrics?.['numerator']).toBe(1);
  });
});

describe('Phase 11 Task 13 — html / outlier handler', () => {
  it('fires on a page whose tag/attribute composition diverges from siblings', () => {
    const entry: OutlierEntry = {
      type: 'outlier',
      id: 'html-tag-outlier',
      description:
        'HTML pages whose tag/attribute composition diverges from sibling pages.',
      matchGlob: 'pages/**/*.html',
      distanceMetric: 'token-composition',
      thresholdSigma: 1.2,
      contentType: 'html',
      extensions: ['.html', '.htm'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const sib1 = makeScan(
      'pages/sub/a.html',
      [
        '<html lang="en">',
        '  <body>',
        '    <main class="ac-page">',
        '      <article class="post"><h1>A</h1></article>',
        '    </main>',
        '  </body>',
        '</html>',
      ].join('\n'),
    );
    const sib2 = makeScan(
      'pages/sub/b.html',
      [
        '<html lang="en">',
        '  <body>',
        '    <main class="ac-page">',
        '      <article class="post"><h1>B</h1></article>',
        '    </main>',
        '  </body>',
        '</html>',
      ].join('\n'),
    );
    const sib3 = makeScan(
      'pages/sub/c.html',
      [
        '<html lang="en">',
        '  <body>',
        '    <main class="ac-page">',
        '      <article class="post"><h1>C</h1></article>',
        '    </main>',
        '  </body>',
        '</html>',
      ].join('\n'),
    );
    const outlier = makeScan(
      'pages/sub/d.html',
      [
        '<html>',
        '<body>',
        '<form action="x" method="POST">',
        '<input name="user" type="text">',
        '<select name="role"><option>a</option></select>',
        '<textarea rows="4"></textarea>',
        '<button type="submit">Go</button>',
        '</form>',
        '</body>',
        '</html>',
      ].join('\n'),
    );
    const finding = outlierHandler.apply({
      entry,
      scans: [sib1, sib2, sib3, outlier],
    });
    expect(finding.provenance).toBe('outlier');
    expect(finding.hits.map((h) => h.file)).toContain('pages/sub/d.html');
  });
});
