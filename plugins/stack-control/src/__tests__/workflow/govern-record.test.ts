// US6 (022) — the mode-keyed govern-convergence record makes the back half
// mechanical: the impl record is the REQUIRED `governing → shipped` signal; the
// spec record is an OPT-IN path (the default `specifying → implementing` is
// analyze-clean, spec audit-barrage parked). RED first (T027). FR-028/FR-029, SC-006.

import { afterEach, describe, expect, it } from 'vitest';
import {
  isModeConverged,
  readGovernConvergenceRecord,
  recordGovernConvergence,
  writeGovernConvergenceRecord,
} from '../../govern/convergence-record.js';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import { derivePhase } from '../../workflow/phase-derivation.js';
import { buildItemContext } from '../../workflow/workflow-context.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/x';
const SPEC = 'specs/022-x';
const KEY = '022-x'; // basename of the spec dir — the convergence-record key

function fixture(overrides: Partial<Parameters<typeof makeWorkflowFixture>[0][number]> = {}): WorkflowFixture {
  const f = makeWorkflowFixture([
    { identifier: ITEM, status: 'in-flight', design: 'd', spec: SPEC, analyzeClean: true, ...overrides },
  ]);
  fixtures.push(f);
  f.writeSpecTasks(SPEC, true); // tasks 100% complete → governing (sans record)
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function deriveFor(f: WorkflowFixture) {
  const item = loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!;
  const { inputs } = buildItemContext(f.root, item);
  return derivePhase(loadWorkflowDoc(f.root), inputs);
}

describe('US6 — the impl record gates governing → shipped (required, mechanical)', () => {
  it('tasks 100% but NO impl convergence record → governing (graduation blocked)', () => {
    const f = fixture();
    expect(deriveFor(f)).toEqual({ kind: 'phase', id: 'governing' });
  });

  it('a recorded ∧ converged impl record → shipped', () => {
    const f = fixture();
    f.writeRecord({
      version: 1,
      mode: 'impl',
      item: KEY,
      scopeFingerprint: 'abc',
      converged: true,
      recordedAt: '2026-06-16T00:00:00Z',
    });
    expect(deriveFor(f)).toEqual({ kind: 'phase', id: 'shipped' });
  });

  it('a recorded-but-NOT-converged impl record does not graduate', () => {
    const f = fixture();
    f.writeRecord({
      version: 1,
      mode: 'impl',
      item: KEY,
      scopeFingerprint: 'abc',
      converged: false,
      recordedAt: '2026-06-16T00:00:00Z',
    });
    expect(deriveFor(f)).toEqual({ kind: 'phase', id: 'governing' });
  });
});

describe('US6 — the spec record is OPT-IN, not the default specifying → implementing gate', () => {
  it('default specifying → implementing derives from analyze-clean, NOT the spec-govern record', () => {
    // analyze NOT clean, but a converged SPEC record present → still 'specifying'
    // (the default gate reads the analyze-clean marker, spec audit-barrage parked).
    const f = makeWorkflowFixture([
      { identifier: ITEM, status: 'in-flight', design: 'd', spec: SPEC, analyzeClean: false },
    ]);
    fixtures.push(f);
    writeGovernConvergenceRecord(f.root, {
      version: 1,
      mode: 'spec',
      item: KEY,
      scopeFingerprint: 'abc',
      converged: true,
      recordedAt: '2026-06-16T00:00:00Z',
    });
    const item = loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!;
    const { inputs } = buildItemContext(f.root, item);
    expect(inputs.specRecordConverged).toBe(true); // the mechanism retained the spec record
    expect(derivePhase(loadWorkflowDoc(f.root), inputs)).toEqual({ kind: 'phase', id: 'specifying' });
  });
});

describe('US6 — the record mechanism (symmetric, mode-keyed)', () => {
  it('writes, reads, and reports convergence per mode', () => {
    const f = makeWorkflowFixture();
    fixtures.push(f);
    expect(isModeConverged(f.root, 'impl', KEY)).toBe(false);
    recordGovernConvergence(f.root, 'impl', KEY, [], '2026-06-16T00:00:00Z');
    expect(isModeConverged(f.root, 'impl', KEY)).toBe(true);
    expect(isModeConverged(f.root, 'spec', KEY)).toBe(false); // distinct mode
    const rec = readGovernConvergenceRecord(f.root, 'impl', KEY);
    expect(rec?.scopeFingerprint).toMatch(/^[0-9a-f]{64}$/); // 021 fingerprint shape
    expect(rec?.anchorRoot).toBe(f.root);
  });

  it('a corrupt record fails loud (no silent fallback)', () => {
    const f = makeWorkflowFixture();
    fixtures.push(f);
    recordGovernConvergence(f.root, 'impl', KEY, [], '2026-06-16T00:00:00Z');
    const path = `${f.root}/.stack-control/govern/convergence/impl__${KEY}.json`;
    f.write('.stack-control/govern/convergence/impl__022-x.json', '{ not json');
    expect(() => readGovernConvergenceRecord(f.root, 'impl', KEY)).toThrow(/corrupt or torn/);
    expect(path).toContain('022-x');
  });
});
