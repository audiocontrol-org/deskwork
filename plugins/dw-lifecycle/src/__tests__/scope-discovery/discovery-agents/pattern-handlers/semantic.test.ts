/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/pattern-handlers/semantic.test.ts
 *
 * Semantic handler — sync stub + async wired tests (Phase 11 Task 7).
 *
 * Two code paths under test:
 *
 *   1. `semanticHandler.apply` (sync) — file-enumeration STUB. Asserts:
 *      - the type is registered + dispatched (no crash, no exception);
 *      - the handler returns zero hits + a `stub: 1` metric;
 *      - `glob_matched_files` is computed correctly (adopters can
 *        verify the catalog entry sees their files even when the LLM
 *        dispatcher isn't wired);
 *      - the provenance is `'semantic'`.
 *
 *   2. `enrichSemanticFinding` (async) — wired LLM-judge path. Asserts
 *      that a mock-dispatched judge produces real hits when the file's
 *      ADHERENCE confidence falls below the threshold + no hits when it
 *      meets/exceeds threshold. The dispatch is mocked at the wrap()
 *      boundary so no real LLM call occurs.
 */

import { describe, it, expect } from 'vitest';
import {
  enrichSemanticFinding,
  semanticHandler,
} from '../../../../scope-discovery/discovery-agents/pattern-handlers/semantic.js';
import type { SemanticEntry } from '../../../../scope-discovery/discovery-agents/pattern-handlers/types.js';
import { registeredPatternTypes } from '../../../../scope-discovery/discovery-agents/pattern-handlers/index.js';
import type { DispatchFn } from '../../../../scope-discovery/dispatch-wrapper.js';
import { DEFAULT_LLM_CONFIG } from '../../../../scope-discovery/llm/config.js';
import { makeScan, TEST_CATALOG_PROVENANCE, TEST_CATALOG_STATUS } from './fixtures.js';

function stubEntry(): SemanticEntry {
  return {
    type: 'semantic',
    id: 'editor-component-semantic-check',
    description: 'LLM-augmented check for editor-component design discipline (stubbed)',
    matchGlob: 'modules/*-editor/src/**/*Summary.tsx',
    promptTemplate: 'Does this file consume the canonical primitive?',
    confidenceThreshold: 0.7,
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
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

/**
 * Build a canned judge response that the dispatch wrapper will accept.
 * The dispatch wrapper's grammar requires Searched/Included/Excluded;
 * the ADHERENCE block goes BEFORE the grammar block.
 */
function judgeResponse(adherence: number, includedFile: string): string {
  // Dispatch grammar requires `line > 0` in Included; we use 1 as a
  // placeholder for the file-level adherence-check semantic.
  return [
    `ADHERENCE: ${adherence}`,
    `REASONING: synthetic mock response for test`,
    ``,
    `Searched: semantic-judge — 1 matches`,
    `Included: ${includedFile}:1`,
    `Excluded: `,
  ].join('\n');
}

describe('enrichSemanticFinding — wired LLM-judge path (Phase 11 Task 7)', () => {
  it('fires a hit when judge confidence is below the threshold', async () => {
    const entry: SemanticEntry = {
      type: 'semantic',
      id: 'editor-component-semantic-check',
      description: 'check editor components adhere to design system',
      matchGlob: 'modules/*-editor/src/**/*Summary.tsx',
      promptTemplate: 'Does this file consume the canonical primitive?',
      confidenceThreshold: 0.7,
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const scan = makeScan(
      'modules/keygroup-editor/src/components/KeygroupSummary.tsx',
      'export const x = 1;',
    );
    const dispatchFn: DispatchFn = async () =>
      judgeResponse(0.4, 'modules/keygroup-editor/src/components/KeygroupSummary.tsx');
    const finding = await enrichSemanticFinding(entry, [scan], {
      dispatchFn,
      repoRoot: '/tmp/unused-in-this-test',
      configOverride: DEFAULT_LLM_CONFIG,
    });
    expect(finding.hits.length).toBe(1);
    expect(finding.hits[0]?.file).toBe(
      'modules/keygroup-editor/src/components/KeygroupSummary.tsx',
    );
    expect(finding.provenance).toBe('semantic');
    expect(finding.metrics?.['judge_active']).toBe(1);
    expect(finding.metrics?.['stub']).toBeUndefined();
  });

  it('does not fire a hit when judge confidence meets the threshold', async () => {
    const entry: SemanticEntry = {
      type: 'semantic',
      id: 'editor-component-semantic-check',
      description: 'check editor components adhere to design system',
      matchGlob: 'modules/*-editor/src/**/*Summary.tsx',
      promptTemplate: 'Does this file consume the canonical primitive?',
      confidenceThreshold: 0.7,
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const scan = makeScan(
      'modules/keygroup-editor/src/components/KeygroupSummary.tsx',
      'export const x = 1;',
    );
    const dispatchFn: DispatchFn = async () =>
      judgeResponse(0.85, 'modules/keygroup-editor/src/components/KeygroupSummary.tsx');
    const finding = await enrichSemanticFinding(entry, [scan], {
      dispatchFn,
      repoRoot: '/tmp/unused-in-this-test',
      configOverride: DEFAULT_LLM_CONFIG,
    });
    expect(finding.hits.length).toBe(0);
    expect(finding.metrics?.['mean_judge_confidence']).toBeCloseTo(0.85, 5);
  });

  it('rejects out-of-range ADHERENCE values loudly (no clamping)', async () => {
    const entry: SemanticEntry = {
      type: 'semantic',
      id: 'badness',
      description: 'oob check',
      matchGlob: '**/*.tsx',
      promptTemplate: 'check',
      confidenceThreshold: 0.5,
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const scan = makeScan('src/foo.tsx', 'x');
    const dispatchFn: DispatchFn = async () => judgeResponse(1.5, 'src/foo.tsx');
    await expect(
      enrichSemanticFinding(entry, [scan], {
        dispatchFn,
        repoRoot: '/tmp/unused',
        configOverride: DEFAULT_LLM_CONFIG,
      }),
    ).rejects.toThrow(/ADHERENCE 1.5 is outside/);
  });

  it('only dispatches against glob-matched files (off-glob files skipped)', async () => {
    const entry: SemanticEntry = {
      type: 'semantic',
      id: 'editor-component-semantic-check',
      description: 'check',
      matchGlob: 'modules/*-editor/**/*.tsx',
      promptTemplate: 'check',
      confidenceThreshold: 0.5,
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const inScope = makeScan('modules/keygroup-editor/src/X.tsx', 'x');
    const offScope = makeScan('docs/random.tsx', 'x');
    let dispatchCallCount = 0;
    const dispatchFn: DispatchFn = async () => {
      dispatchCallCount += 1;
      return judgeResponse(0.9, 'modules/keygroup-editor/src/X.tsx');
    };
    await enrichSemanticFinding(entry, [inScope, offScope], {
      dispatchFn,
      repoRoot: '/tmp/unused',
      configOverride: DEFAULT_LLM_CONFIG,
    });
    expect(dispatchCallCount).toBe(1);
  });
});
