/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/synthesis-report.test.ts
 *
 * Phase 11 Task 12 — inventory-vs-discovery report rendering. Asserts:
 *
 *   1. categorizeFindings() bins findings into the three operator-visible
 *      categories per their status_provenance + discovered_candidates
 *      shape: registered-pattern, discovered-candidate, novel-shape-candidate.
 *   2. renderFindingCategoryReport() emits the markdown heading + the
 *      three category lines + a per-bucket breakdown when applicable.
 *   3. The "operator action" advisory fires when novel-shape candidates
 *      or discovered candidates are present (it must NOT fire on a clean
 *      registered-pattern-only run).
 *   4. renderCategorySummaryLine() emits the one-line stderr summary.
 *   5. Gutted-stub self-check: a manifest with zero findings still emits
 *      the heading + the "clean — no findings" body.
 *
 * The bins derive entirely from in-memory `ScopeManifest` data, so the
 * test fixtures construct minimal-shape manifests rather than driving
 * full synthesize() round-trips.
 */

import { describe, expect, it } from 'vitest';
import {
  categorizeFindings,
  renderCategorySummaryLine,
  renderFindingCategoryReport,
} from '../../scope-discovery/synthesis-report.js';
import type {
  ManifestRegimeHoldoutEntry,
  ScopeManifest,
} from '../../scope-discovery/synthesis-types.js';

const BASE_MANIFEST: ScopeManifest = {
  kind: 'code',
  feature_slug: 'fixture',
  generated_by: 'strawman',
  generated_at: '2026-05-26T00:00:00Z',
  scenarios: [
    {
      id: 'default',
      label: 'Default state',
      description: 'Strawman scenario.',
    },
  ],
  reference_docs: [
    { path: 'prd.md', role: 'prd', summary: 'PRD' },
  ],
  discovery_themes: ['polishtest (1 occurrence)'],
};

function makeRegimeEntry(
  overrides: Partial<ManifestRegimeHoldoutEntry> & {
    readonly source_status: ManifestRegimeHoldoutEntry['status_provenance']['source_status'];
    readonly provenance_source: ManifestRegimeHoldoutEntry['status_provenance']['provenance_source'];
  },
): ManifestRegimeHoldoutEntry {
  const { source_status, provenance_source, ...rest } = overrides;
  return {
    id: 'entry-id',
    file: 'modules/test/src/a.ts',
    shape: 'shape description',
    replacement: 'use canonical instead',
    evidence: {
      registry_path: '.dw-lifecycle/scope-discovery/anti-patterns.yaml',
      registry_id: 'entry-id',
    },
    status_provenance: { source_status, provenance_source },
    ...rest,
  };
}

describe('synthesis-report — categorizeFindings', () => {
  it('classifies blessed/operator-authored findings as registered-pattern', () => {
    const manifest: ScopeManifest = {
      ...BASE_MANIFEST,
      regime_holdouts: {
        anti_patterns: [
          makeRegimeEntry({
            source_status: 'blessed',
            provenance_source: 'operator-authored',
          }),
        ],
        adopter_manifests: [],
        module_symmetry: [],
        deprecations: [],
        meta: {
          total: 1,
          by_source: {
            anti_pattern: 1,
            adopter_manifest: 0,
            module_symmetry: 0,
            deprecation: 0,
          },
          by_status: { actively_enforced: 1, candidate: 0 },
        },
      },
    };
    const b = categorizeFindings(manifest);
    expect(b.totals.registeredPattern).toBe(1);
    expect(b.totals.novelShapeCandidate).toBe(0);
    expect(b.totals.discoveredCandidate).toBe(0);
    expect(b.perBucket.anti_patterns.registeredPattern).toBe(1);
  });

  it('classifies orchestrator-agent-provenanced findings as novel-shape-candidate', () => {
    const manifest: ScopeManifest = {
      ...BASE_MANIFEST,
      regime_holdouts: {
        anti_patterns: [],
        adopter_manifests: [
          makeRegimeEntry({
            source_status: 'blessed',
            provenance_source: 'orchestrator-agent',
          }),
        ],
        module_symmetry: [],
        deprecations: [],
        meta: {
          total: 1,
          by_source: {
            anti_pattern: 0,
            adopter_manifest: 1,
            module_symmetry: 0,
            deprecation: 0,
          },
          by_status: { actively_enforced: 1, candidate: 0 },
        },
      },
    };
    const b = categorizeFindings(manifest);
    expect(b.totals.registeredPattern).toBe(0);
    expect(b.totals.novelShapeCandidate).toBe(1);
    expect(b.perBucket.adopter_manifests.novelShapeCandidate).toBe(1);
    expect(b.perBucket.adopter_manifests.registeredPattern).toBe(0);
  });

  it('classifies pending-status findings as novel-shape-candidate even when authored', () => {
    const manifest: ScopeManifest = {
      ...BASE_MANIFEST,
      regime_holdouts: {
        anti_patterns: [
          makeRegimeEntry({
            source_status: 'pending',
            provenance_source: 'operator-authored',
          }),
        ],
        adopter_manifests: [],
        module_symmetry: [],
        deprecations: [],
        meta: {
          total: 1,
          by_source: {
            anti_pattern: 1,
            adopter_manifest: 0,
            module_symmetry: 0,
            deprecation: 0,
          },
          by_status: { actively_enforced: 0, candidate: 1 },
        },
      },
    };
    const b = categorizeFindings(manifest);
    expect(b.totals.registeredPattern).toBe(0);
    expect(b.totals.novelShapeCandidate).toBe(1);
    expect(b.pendingMetaCount).toBe(1);
  });

  it('counts llm-judge-proposed as novel-shape-candidate regardless of status', () => {
    const manifest: ScopeManifest = {
      ...BASE_MANIFEST,
      regime_holdouts: {
        anti_patterns: [],
        adopter_manifests: [],
        module_symmetry: [],
        deprecations: [
          makeRegimeEntry({
            source_status: 'cursed',
            provenance_source: 'llm-judge-proposed',
          }),
        ],
        meta: {
          total: 1,
          by_source: {
            anti_pattern: 0,
            adopter_manifest: 0,
            module_symmetry: 0,
            deprecation: 1,
          },
          by_status: { actively_enforced: 1, candidate: 0 },
        },
      },
    };
    const b = categorizeFindings(manifest);
    expect(b.totals.novelShapeCandidate).toBe(1);
    expect(b.totals.registeredPattern).toBe(0);
    expect(b.perBucket.deprecations.novelShapeCandidate).toBe(1);
  });

  it('counts discovered_candidates: as discovered-candidate', () => {
    const manifest: ScopeManifest = {
      ...BASE_MANIFEST,
      discovered_candidates: [
        {
          cluster_id: 'cluster-1',
          summary: 'utility-class adopter outliers',
          member_count: 4,
          exemplar_files: ['a.ts', 'b.ts'],
        },
        {
          cluster_id: 'cluster-2',
          summary: 'second cluster',
          member_count: 2,
          exemplar_files: ['c.ts'],
        },
      ],
    };
    const b = categorizeFindings(manifest);
    expect(b.totals.discoveredCandidate).toBe(2);
    expect(b.discoveredCandidatesClusterCount).toBe(2);
    expect(b.totals.registeredPattern).toBe(0);
    expect(b.totals.novelShapeCandidate).toBe(0);
  });
});

describe('synthesis-report — renderFindingCategoryReport', () => {
  it('emits the canonical heading + clean-no-findings body for empty manifests', () => {
    const out = renderFindingCategoryReport(BASE_MANIFEST);
    expect(out).toContain('## Inventory vs. discovery — finding categories');
    expect(out).toContain('clean — no findings');
  });

  it('emits the three category counters when there are findings', () => {
    const manifest: ScopeManifest = {
      ...BASE_MANIFEST,
      regime_holdouts: {
        anti_patterns: [
          makeRegimeEntry({
            source_status: 'blessed',
            provenance_source: 'operator-authored',
          }),
          makeRegimeEntry({
            id: 'entry-2',
            file: 'b.ts',
            source_status: 'pending',
            provenance_source: 'operator-authored',
          }),
        ],
        adopter_manifests: [],
        module_symmetry: [],
        deprecations: [],
        meta: {
          total: 2,
          by_source: {
            anti_pattern: 2,
            adopter_manifest: 0,
            module_symmetry: 0,
            deprecation: 0,
          },
          by_status: { actively_enforced: 1, candidate: 1 },
        },
      },
      discovered_candidates: [
        {
          cluster_id: 'c1',
          summary: 's',
          member_count: 1,
          exemplar_files: ['x.ts'],
        },
      ],
    };
    const out = renderFindingCategoryReport(manifest);
    expect(out).toContain('Registered-pattern matches (inventory):** 1');
    expect(out).toContain('Discovered candidates');
    expect(out).toContain('1'); // discovered-candidate count
    expect(out).toContain('Novel-shape candidates (per-handler):** 1');
    expect(out).toContain('Operator action');
  });

  it('does NOT emit the operator-action advisory for a clean registered-pattern-only run', () => {
    const manifest: ScopeManifest = {
      ...BASE_MANIFEST,
      regime_holdouts: {
        anti_patterns: [
          makeRegimeEntry({
            source_status: 'blessed',
            provenance_source: 'operator-authored',
          }),
        ],
        adopter_manifests: [],
        module_symmetry: [],
        deprecations: [],
        meta: {
          total: 1,
          by_source: {
            anti_pattern: 1,
            adopter_manifest: 0,
            module_symmetry: 0,
            deprecation: 0,
          },
          by_status: { actively_enforced: 1, candidate: 0 },
        },
      },
    };
    const out = renderFindingCategoryReport(manifest);
    expect(out).not.toContain('Operator action');
  });

  it('emits a per-bucket breakdown when there are anti-pattern + adopter-manifest findings', () => {
    const manifest: ScopeManifest = {
      ...BASE_MANIFEST,
      regime_holdouts: {
        anti_patterns: [
          makeRegimeEntry({
            source_status: 'blessed',
            provenance_source: 'operator-authored',
          }),
        ],
        adopter_manifests: [
          makeRegimeEntry({
            id: 'am-1',
            file: 'b.ts',
            source_status: 'cursed',
            provenance_source: 'install-seed',
          }),
        ],
        module_symmetry: [],
        deprecations: [],
        meta: {
          total: 2,
          by_source: {
            anti_pattern: 1,
            adopter_manifest: 1,
            module_symmetry: 0,
            deprecation: 0,
          },
          by_status: { actively_enforced: 2, candidate: 0 },
        },
      },
    };
    const out = renderFindingCategoryReport(manifest);
    expect(out).toContain('Per-bucket breakdown');
    expect(out).toContain('anti-patterns: 1');
    expect(out).toContain('adopter-manifests: 1');
  });
});

describe('synthesis-report — renderCategorySummaryLine', () => {
  it('emits the registered-pattern + discovered-candidate + novel-shape-candidate counts', () => {
    const manifest: ScopeManifest = {
      ...BASE_MANIFEST,
      discovered_candidates: [
        {
          cluster_id: 'c1',
          summary: 's',
          member_count: 1,
          exemplar_files: ['x.ts'],
        },
      ],
    };
    const line = renderCategorySummaryLine(manifest);
    expect(line).toBe(
      'categories: registered-pattern=0, discovered-candidate=1, novel-shape-candidate=0',
    );
  });
});
