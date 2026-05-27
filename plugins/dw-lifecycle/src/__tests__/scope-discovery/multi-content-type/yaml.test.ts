/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/multi-content-type/yaml.test.ts
 *
 * Phase 11 Task 13 — YAML content-type support across every pattern
 * primitive in the polymorphic dispatcher:
 *
 *   - regex          (frontmatter / configuration-key conventions)
 *   - negative-space (YAML configs missing required canonical key)
 *   - coverage       (canonical-key adoption across config files)
 *   - outlier        (token-composition with content_type='yaml';
 *                     tokens = top-level + nested key names)
 *
 * The tokenizer's "key" definition is regex-driven (`^\s*name:` on each
 * line) — it doesn't parse YAML semantically. False positives are
 * cheaper than false negatives at the discovery layer; the synthesis
 * layer + operator curate.
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

const CONFIG_WITH_SCHEMA = [
  'schemaVersion: 1',
  'name: example',
  'items:',
  '  - a',
  '  - b',
].join('\n');

const CONFIG_WITHOUT_SCHEMA = ['name: example', 'items:', '  - a', '  - b'].join(
  '\n',
);

describe('Phase 11 Task 13 — yaml / regex handler', () => {
  it('fires on a top-level key that retired (e.g., legacy `version:` → `schemaVersion:`)', () => {
    const entry: RegexEntry = {
      type: 'regex',
      id: 'legacy-version-key',
      description:
        'Top-level `version:` key — retired in favor of `schemaVersion:`.',
      regex: /^version:\s/gm,
      extensions: ['.yaml', '.yml'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const offending = makeScan(
      'config/old.yaml',
      ['version: 2', 'name: x'].join('\n'),
    );
    const finding = regexHandler.apply({ entry, scans: [offending] });
    expect(finding.hits.length).toBe(1);
  });

  it('does NOT fire on a TypeScript file with the same text', () => {
    const entry: RegexEntry = {
      type: 'regex',
      id: 'legacy-version-key',
      description: 'YAML-only key check',
      regex: /^version:\s/gm,
      extensions: ['.yaml', '.yml'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const tsScan = makeScan(
      'src/version-check.ts',
      'const x = `version: 2`; // not yaml',
    );
    const finding = regexHandler.apply({ entry, scans: [tsScan] });
    expect(finding.hits).toEqual([]);
  });
});

describe('Phase 11 Task 13 — yaml / negative-space handler', () => {
  const entry: NegativeSpaceEntry = {
    type: 'negative-space',
    id: 'config-missing-schema-version',
    description:
      'YAML configs under `.dw-lifecycle/` that lack the canonical `schemaVersion:` field.',
    matchGlob: '.dw-lifecycle/**/*.yaml',
    mustContain: /^schemaVersion:\s/gm,
    threshold: 1,
    extensions: ['.yaml', '.yml'],
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
  };

  it('FIRES on a YAML config that lacks schemaVersion', () => {
    const offending = makeScan(
      '.dw-lifecycle/scope-discovery/clones.yaml',
      CONFIG_WITHOUT_SCHEMA,
    );
    const finding = negativeSpaceHandler.apply({ entry, scans: [offending] });
    expect(finding.hits).toHaveLength(1);
    expect(finding.provenance).toBe('negative-space');
  });

  it('does NOT fire on a config that carries schemaVersion', () => {
    const healthy = makeScan(
      '.dw-lifecycle/scope-discovery/clones.yaml',
      CONFIG_WITH_SCHEMA,
    );
    const finding = negativeSpaceHandler.apply({ entry, scans: [healthy] });
    expect(finding.hits).toEqual([]);
  });

  it('does NOT fire on a yaml file outside the glob', () => {
    const offGlob = makeScan('other/config.yaml', CONFIG_WITHOUT_SCHEMA);
    const finding = negativeSpaceHandler.apply({ entry, scans: [offGlob] });
    expect(finding.hits).toEqual([]);
  });
});

describe('Phase 11 Task 13 — yaml / coverage handler', () => {
  it('emits adoption ratio for canonical key usage', () => {
    const entry: CoverageEntry = {
      type: 'coverage',
      id: 'schema-version-adoption',
      description: 'Fraction of YAML configs carrying schemaVersion.',
      matchGlob: '.dw-lifecycle/**/*.yaml',
      mustContain: /^schemaVersion:/gm,
      extensions: ['.yaml', '.yml'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const a = makeScan('.dw-lifecycle/scope-discovery/a.yaml', CONFIG_WITH_SCHEMA);
    const b = makeScan('.dw-lifecycle/scope-discovery/b.yaml', CONFIG_WITHOUT_SCHEMA);
    const c = makeScan('.dw-lifecycle/scope-discovery/c.yaml', CONFIG_WITH_SCHEMA);
    const d = makeScan('.dw-lifecycle/scope-discovery/d.yaml', CONFIG_WITH_SCHEMA);
    const finding = coverageHandler.apply({ entry, scans: [a, b, c, d] });
    expect(finding.metrics?.['denominator']).toBe(4);
    expect(finding.metrics?.['numerator']).toBe(3);
    const ratio = finding.metrics?.['ratio'] ?? 0;
    expect(ratio).toBeCloseTo(3 / 4, 5);
  });
});

describe('Phase 11 Task 13 — yaml / outlier handler', () => {
  const entry: OutlierEntry = {
    type: 'outlier',
    id: 'yaml-key-outlier',
    description:
      'YAML configs whose top-level keys diverge from directory siblings.',
    matchGlob: 'config/**/*.yaml',
    distanceMetric: 'token-composition',
    thresholdSigma: 1.2,
    contentType: 'yaml',
    extensions: ['.yaml', '.yml'],
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
  };

  it('fires on a YAML config with divergent key shape', () => {
    // Three siblings share most-but-not-all top-level keys (small
    // natural variance so per-directory stddev is non-zero; the outlier
    // handler skips zero-stddev directories).
    const sib1 = makeScan(
      'config/envs/a.yaml',
      ['schemaVersion: 1', 'name: a', 'items:', '  - x'].join('\n'),
    );
    const sib2 = makeScan(
      'config/envs/b.yaml',
      [
        'schemaVersion: 1',
        'name: b',
        'items:',
        '  - y',
        'description: optional',
      ].join('\n'),
    );
    const sib3 = makeScan(
      'config/envs/c.yaml',
      [
        'schemaVersion: 1',
        'name: c',
        'items:',
        '  - z',
        'owner: team',
      ].join('\n'),
    );
    // Outlier uses different keys entirely.
    const outlier = makeScan(
      'config/envs/d.yaml',
      [
        'kind: Pod',
        'apiVersion: v1',
        'metadata:',
        '  labels:',
        '    app: weird',
        'spec:',
        '  containers:',
        '    - image: foo',
      ].join('\n'),
    );
    const finding = outlierHandler.apply({
      entry,
      scans: [sib1, sib2, sib3, outlier],
    });
    expect(finding.provenance).toBe('outlier');
    const flagged = finding.hits.map((h) => h.file);
    expect(flagged).toContain('config/envs/d.yaml');
    expect(flagged).not.toContain('config/envs/a.yaml');
  });

  it('content_type="auto" with .yml resolves to yaml tokenization', () => {
    const autoEntry: OutlierEntry = {
      ...entry,
      contentType: 'auto',
      matchGlob: 'config/**/*.yml',
      extensions: ['.yml'],
    };
    const sib1 = makeScan(
      'config/envs/a.yml',
      ['name: a', 'items:', '  - one'].join('\n'),
    );
    const sib2 = makeScan(
      'config/envs/b.yml',
      ['name: b', 'items:', '  - two', 'description: x'].join('\n'),
    );
    const sib3 = makeScan(
      'config/envs/c.yml',
      ['name: c', 'items:', '  - three', 'owner: y'].join('\n'),
    );
    const outlier = makeScan(
      'config/envs/d.yml',
      [
        'kind: deployment',
        'spec:',
        '  replicas: 3',
        '  template:',
        '    metadata:',
        '      labels:',
        '        env: production',
      ].join('\n'),
    );
    const finding = outlierHandler.apply({
      entry: autoEntry,
      scans: [sib1, sib2, sib3, outlier],
    });
    expect(finding.hits.map((h) => h.file)).toContain('config/envs/d.yml');
  });
});
