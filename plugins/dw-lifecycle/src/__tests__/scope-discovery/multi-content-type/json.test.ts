/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/multi-content-type/json.test.ts
 *
 * Phase 11 Task 13 — JSON content-type support across every pattern
 * primitive in the polymorphic dispatcher:
 *
 *   - regex          (schema patterns / forbidden key shapes)
 *   - negative-space (JSON files missing canonical key)
 *   - coverage       (canonical-key adoption across JSON manifests)
 *   - outlier        (token-composition with content_type='json';
 *                     tokens = JSON key names)
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

const PKG_WITH_LICENSE = JSON.stringify(
  {
    name: 'foo',
    version: '1.0.0',
    license: 'GPL-3.0-or-later',
    main: 'index.js',
  },
  null,
  2,
);

const PKG_WITHOUT_LICENSE = JSON.stringify(
  { name: 'foo', version: '1.0.0', main: 'index.js' },
  null,
  2,
);

describe('Phase 11 Task 13 — json / regex handler', () => {
  it('fires on `"any":` keys in tsconfig (forbidden per `strict: true`)', () => {
    const entry: RegexEntry = {
      type: 'regex',
      id: 'tsconfig-allow-any',
      description: 'tsconfig file with explicit `noImplicitAny: false`',
      regex: /"noImplicitAny"\s*:\s*false/g,
      extensions: ['.json'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const offending = makeScan(
      'packages/x/tsconfig.json',
      '{"compilerOptions":{"noImplicitAny":false}}',
    );
    const finding = regexHandler.apply({ entry, scans: [offending] });
    expect(finding.hits).toHaveLength(1);
  });
});

describe('Phase 11 Task 13 — json / negative-space handler', () => {
  const entry: NegativeSpaceEntry = {
    type: 'negative-space',
    id: 'package-missing-license',
    description: 'package.json files lacking a `license` field.',
    matchGlob: 'packages/**/package.json',
    mustContain: /"license"\s*:\s*"/g,
    threshold: 1,
    extensions: ['.json'],
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
  };

  it('FIRES on a package.json missing the license field', () => {
    const offending = makeScan(
      'packages/foo/package.json',
      PKG_WITHOUT_LICENSE,
    );
    const finding = negativeSpaceHandler.apply({ entry, scans: [offending] });
    expect(finding.hits).toHaveLength(1);
    expect(finding.provenance).toBe('negative-space');
  });

  it('does NOT fire on a package.json with a license field', () => {
    const healthy = makeScan('packages/foo/package.json', PKG_WITH_LICENSE);
    const finding = negativeSpaceHandler.apply({ entry, scans: [healthy] });
    expect(finding.hits).toEqual([]);
  });
});

describe('Phase 11 Task 13 — json / coverage handler', () => {
  it('emits adoption ratio for canonical key usage', () => {
    const entry: CoverageEntry = {
      type: 'coverage',
      id: 'license-adoption',
      description: 'Fraction of package.json files carrying a license.',
      matchGlob: 'packages/**/package.json',
      mustContain: /"license"\s*:\s*"/g,
      extensions: ['.json'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const a = makeScan('packages/a/package.json', PKG_WITH_LICENSE);
    const b = makeScan('packages/b/package.json', PKG_WITHOUT_LICENSE);
    const c = makeScan('packages/c/package.json', PKG_WITH_LICENSE);
    const finding = coverageHandler.apply({ entry, scans: [a, b, c] });
    expect(finding.metrics?.['denominator']).toBe(3);
    expect(finding.metrics?.['numerator']).toBe(2);
    const ratio = finding.metrics?.['ratio'] ?? 0;
    expect(ratio).toBeCloseTo(2 / 3, 5);
  });
});

describe('Phase 11 Task 13 — json / outlier handler', () => {
  // For outlier detection to fire, the population must be > 1 within a
  // single parent directory (bucketed by parent-dir per outlier.ts). The
  // fixture lays the manifests out side-by-side under `manifests/` so
  // the bucket has population 4.
  const entry: OutlierEntry = {
    type: 'outlier',
    id: 'json-key-outlier',
    description: 'JSON manifests whose keys diverge from sibling manifests.',
    matchGlob: 'manifests/**/*.json',
    distanceMetric: 'token-composition',
    thresholdSigma: 1.2,
    contentType: 'json',
    extensions: ['.json'],
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
  };

  it('fires on a JSON manifest whose key set diverges from sibling manifests', () => {
    // Three siblings share most-but-not-all keys (small natural variance
    // so the per-directory stddev is non-zero; the outlier handler
    // intentionally skips zero-stddev directories — see outlier.ts).
    const sib1 = makeScan(
      'manifests/registry/a.json',
      JSON.stringify(
        { name: 'a', version: '1.0.0', license: 'GPL-3.0-or-later', main: 'index.js' },
        null,
        2,
      ),
    );
    const sib2 = makeScan(
      'manifests/registry/b.json',
      JSON.stringify(
        { name: 'b', version: '1.0.0', license: 'GPL-3.0-or-later', main: 'index.js', author: 'x' },
        null,
        2,
      ),
    );
    const sib3 = makeScan(
      'manifests/registry/c.json',
      JSON.stringify(
        { name: 'c', version: '1.0.0', license: 'GPL-3.0-or-later', main: 'index.js', description: 'y' },
        null,
        2,
      ),
    );
    // Outlier uses a completely different schema (k8s-style).
    const outlier = makeScan(
      'manifests/registry/d.json',
      JSON.stringify(
        {
          kind: 'Deployment',
          apiVersion: 'apps/v1',
          metadata: { labels: { app: 'weird' } },
          spec: { replicas: 3, template: { spec: { containers: [] } } },
        },
        null,
        2,
      ),
    );
    const finding = outlierHandler.apply({
      entry,
      scans: [sib1, sib2, sib3, outlier],
    });
    expect(finding.provenance).toBe('outlier');
    const flagged = finding.hits.map((h) => h.file);
    expect(flagged).toContain('manifests/registry/d.json');
    expect(flagged).not.toContain('manifests/registry/a.json');
  });

  it('content_type="auto" with .json extension resolves to json tokenization', () => {
    const autoEntry: OutlierEntry = { ...entry, contentType: 'auto' };
    const sib1 = makeScan(
      'manifests/registry/a.json',
      JSON.stringify(
        { name: 'a', version: '1.0.0', license: 'GPL-3.0', main: 'i.js' },
        null,
        2,
      ),
    );
    const sib2 = makeScan(
      'manifests/registry/b.json',
      JSON.stringify(
        { name: 'b', version: '1.0.0', license: 'GPL-3.0', main: 'i.js', author: 'a' },
        null,
        2,
      ),
    );
    const sib3 = makeScan(
      'manifests/registry/c.json',
      JSON.stringify(
        { name: 'c', version: '1.0.0', license: 'GPL-3.0', main: 'i.js', description: 'd' },
        null,
        2,
      ),
    );
    const outlier = makeScan(
      'manifests/registry/d.json',
      JSON.stringify(
        {
          kind: 'Deployment',
          apiVersion: 'apps/v1',
          metadata: { labels: { app: 'weird' } },
          spec: { replicas: 3 },
        },
        null,
        2,
      ),
    );
    const finding = outlierHandler.apply({
      entry: autoEntry,
      scans: [sib1, sib2, sib3, outlier],
    });
    expect(finding.hits.map((h) => h.file)).toContain('manifests/registry/d.json');
  });
});
