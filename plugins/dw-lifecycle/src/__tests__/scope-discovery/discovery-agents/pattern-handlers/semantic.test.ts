/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/pattern-handlers/semantic.test.ts
 *
 * Semantic handler — STUB tests (Phase 11 G6). The LLM-judge wiring
 * lands under Phase 11 Task 7; this test asserts:
 *
 *   - the type is registered + dispatched (no crash, no exception);
 *   - the handler returns zero hits + a `stub: 1` metric;
 *   - `glob_matched_files` is computed correctly (so adopters can
 *     verify the catalog entry sees their files even before the LLM
 *     wires in);
 *   - the provenance is `'semantic'`.
 *
 * When the real wiring lands, the file-enumeration shape is preserved
 * but `hits[]` becomes meaningful + `stub` metric goes away.
 */

import { describe, it, expect } from 'vitest';
import { semanticHandler } from '../../../../scope-discovery/discovery-agents/pattern-handlers/semantic.js';
import type { SemanticEntry } from '../../../../scope-discovery/discovery-agents/pattern-handlers/types.js';
import { registeredPatternTypes } from '../../../../scope-discovery/discovery-agents/pattern-handlers/index.js';
import { makeScan } from './fixtures.js';

function stubEntry(): SemanticEntry {
  return {
    type: 'semantic',
    id: 'editor-component-semantic-check',
    description: 'LLM-augmented check for editor-component design discipline (stubbed)',
    matchGlob: 'modules/*-editor/src/**/*Summary.tsx',
    promptTemplate: 'Does this file consume the canonical primitive?',
    confidenceThreshold: 0.7,
  };
}

describe('semantic handler — STUB (Phase 11 G6)', () => {
  it('returns zero hits + stub metric', () => {
    const scan = makeScan(
      'modules/keygroup-editor/src/components/KeygroupSummary.tsx',
      'export const x = 1;',
    );
    const finding = semanticHandler.apply({
      entry: stubEntry(),
      scans: [scan],
    });
    expect(finding.hits).toEqual([]);
    expect(finding.metrics?.['stub']).toBe(1);
    expect(finding.provenance).toBe('semantic');
  });

  it('reports glob_matched_files correctly (handler enumerates the in-scope set)', () => {
    const matched = makeScan(
      'modules/keygroup-editor/src/components/KeygroupSummary.tsx',
      'x',
    );
    const offGlob = makeScan('docs/random.tsx', 'x');
    const finding = semanticHandler.apply({
      entry: stubEntry(),
      scans: [matched, offGlob],
    });
    expect(finding.metrics?.['glob_matched_files']).toBe(1);
  });

  it('reports confidence_threshold metric (so synthesis layer sees the value)', () => {
    const finding = semanticHandler.apply({
      entry: stubEntry(),
      scans: [],
    });
    expect(finding.metrics?.['confidence_threshold']).toBe(0.7);
  });
});

describe('dispatcher — semantic type registered', () => {
  it('registeredPatternTypes() lists `semantic` so the dispatcher routes it', () => {
    expect(registeredPatternTypes()).toContain('semantic');
  });

  it('all five v1.1 Task 1 types are registered (regex / negative-space / coverage / outlier / semantic)', () => {
    const types = registeredPatternTypes();
    expect([...types].sort()).toEqual(
      ['coverage', 'negative-space', 'outlier', 'regex', 'semantic'].sort(),
    );
  });
});
