/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/pattern-handlers/coverage.test.ts
 *
 * Coverage-metric handler tests (Phase 11 G3). Asserts the ratio
 * computation, denominator-zero behavior, and that the handler emits
 * no per-file hits (the metric is the payload).
 */

import { describe, it, expect } from 'vitest';
import { coverageHandler } from '../../../../scope-discovery/discovery-agents/pattern-handlers/coverage.js';
import type { CoverageEntry } from '../../../../scope-discovery/discovery-agents/pattern-handlers/types.js';
import { makeScan, TEST_CATALOG_PROVENANCE, TEST_CATALOG_STATUS } from './fixtures.js';

function adoptionEntry(): CoverageEntry {
  return {
    type: 'coverage',
    id: 'editor-canonical-adoption',
    description: 'Fraction of editor summary files consuming the canonical primitive',
    matchGlob: 'modules/*-editor/src/**/*Summary.tsx',
    mustContain: /\bac-[a-z]+/g,
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
  };
}

describe('coverage handler — adoption ratio', () => {
  it('emits ratio = matching/total when half of glob files contain must_contain', () => {
    const adopts = makeScan(
      'modules/keygroup-editor/src/components/A.Summary.tsx',
      'const x = "ac-card";',
    );
    const skips = makeScan(
      'modules/keygroup-editor/src/components/B.Summary.tsx',
      'const x = "flex";',
    );
    const finding = coverageHandler.apply({
      entry: adoptionEntry(),
      scans: [adopts, skips],
    });
    expect(finding.metrics).toBeDefined();
    expect(finding.metrics?.['denominator']).toBe(2);
    expect(finding.metrics?.['numerator']).toBe(1);
    expect(finding.metrics?.['ratio']).toBeCloseTo(0.5);
    // Coverage handler emits no per-file hits — the metric is the
    // payload. The synthesis layer reads `metrics`.
    expect(finding.hits).toEqual([]);
    expect(finding.provenance).toBe('coverage-gap');
  });

  it('reports ratio = 1 when every glob-matched file contains must_contain', () => {
    const a = makeScan(
      'modules/keygroup-editor/src/components/A.Summary.tsx',
      'const x = "ac-card";',
    );
    const b = makeScan(
      'modules/keygroup-editor/src/components/B.Summary.tsx',
      'const x = "ac-text";',
    );
    const finding = coverageHandler.apply({
      entry: adoptionEntry(),
      scans: [a, b],
    });
    expect(finding.metrics?.['ratio']).toBe(1);
  });

  it('reports ratio = 0 when no glob-matched files contain must_contain', () => {
    const a = makeScan(
      'modules/keygroup-editor/src/components/A.Summary.tsx',
      'const x = "flex";',
    );
    const finding = coverageHandler.apply({
      entry: adoptionEntry(),
      scans: [a],
    });
    expect(finding.metrics?.['ratio']).toBe(0);
  });

  it('reports ratio = 0 with denominator 0 when no files match the glob', () => {
    const offGlob = makeScan('docs/random.tsx', 'const x = "ac-card";');
    const finding = coverageHandler.apply({
      entry: adoptionEntry(),
      scans: [offGlob],
    });
    expect(finding.metrics?.['denominator']).toBe(0);
    expect(finding.metrics?.['numerator']).toBe(0);
    expect(finding.metrics?.['ratio']).toBe(0);
  });

  it('respects extensions filter', () => {
    const entry: CoverageEntry = {
      ...adoptionEntry(),
      extensions: ['.tsx'],
    };
    const tsx = makeScan(
      'modules/keygroup-editor/src/components/A.Summary.tsx',
      'const x = "ac-card";',
    );
    const ts = makeScan(
      'modules/keygroup-editor/src/components/A.Summary.ts',
      'const x = "ac-card";',
    );
    const finding = coverageHandler.apply({ entry, scans: [tsx, ts] });
    expect(finding.metrics?.['denominator']).toBe(1);
  });
});
