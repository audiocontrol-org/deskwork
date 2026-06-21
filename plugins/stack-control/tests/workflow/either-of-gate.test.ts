// T035 (RED-first, 029 Phase 6 US6) — the graduate gate becomes EITHER-OF:
// it graduates when all per-phase checkpoints are current (the default path) OR
// when a whole-feature convergence record exists (the opt-in full-audit-at-end
// path, re-admitted per FR-025). With NEITHER, it does not graduate. FR-023/024.
//
// On-disk fixtures via makeUnskippableFixture (real checkpoints + records), per testing.md.

import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { evaluateCriterion, type GateContext } from '../../src/workflow/gate-eval.js';
import type { Criterion } from '../../src/workflow/workflow-types.js';
import {
  makeUnskippableFixture,
  type UnskippableFixture,
} from '../../src/__tests__/fixtures/workflow/unskippable-fixtures.js';

let fixtures: UnskippableFixture[] = [];
function threePhase(): UnskippableFixture {
  const f = makeUnskippableFixture({
    slug: '029-either-of-fixture',
    node: { identifier: 'multi:feature/x', status: 'in-flight' },
    phases: [
      { id: '1', files: [{ path: 'src/feat/a.ts', content: 'export const a = 1;\n' }] },
      { id: '2', files: [{ path: 'src/feat/b.ts', content: 'export const b = 2;\n' }] },
      { id: '3', files: [{ path: 'src/feat/c.ts', content: 'export const c = 3;\n' }] },
    ],
  });
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

const GRADUATE: Criterion = { kind: 'graduate-impl', target: 'impl' };

function ctxFor(f: UnskippableFixture, implRecordConverged: boolean): GateContext {
  return {
    installationRoot: f.root,
    item: 'multi:feature/x',
    designPointer: null,
    specPointer: f.specDirRel,
    analyzeClean: true,
    designApproved: true,
    designRecordPath: null,
    specDirPath: join(f.root, f.specDirRel),
    implRecordConverged,
    specRecordConverged: false,
    advanceTreeClean: true,
  };
}

describe('US6 either-of graduate gate (FR-023/024)', () => {
  it('graduates via the DEFAULT per-phase path (all checkpoints current, no whole-feature record)', () => {
    const f = threePhase();
    f.checkpointPhase('1');
    f.checkpointPhase('2');
    f.checkpointPhase('3');
    expect(evaluateCriterion(GRADUATE, ctxFor(f, false))).toBe(true);
  });

  it('graduates via the OPT-IN whole-feature record path (no per-phase checkpoints)', () => {
    const f = threePhase();
    // No per-phase checkpoints; a converged whole-feature record is the opt-in escape.
    expect(evaluateCriterion(GRADUATE, ctxFor(f, true))).toBe(true);
  });

  it('does NOT graduate with neither per-phase checkpoints nor a whole-feature record', () => {
    const f = threePhase();
    expect(evaluateCriterion(GRADUATE, ctxFor(f, false))).toBe(false);
  });

  it('a partial per-phase set without a whole-feature record does not graduate', () => {
    const f = threePhase();
    f.checkpointPhase('1');
    f.checkpointPhase('2');
    expect(evaluateCriterion(GRADUATE, ctxFor(f, false))).toBe(false);
  });

  it('graduates on the whole-feature record even when no spec dir resolves (AUDIT-20260621-29)', () => {
    const f = threePhase();
    // specDirPath = null → the per-phase branch is structurally false; the opt-in
    // whole-feature record alone must still graduate.
    const ctx = { ...ctxFor(f, true), specDirPath: null, specPointer: null };
    expect(evaluateCriterion(GRADUATE, ctx)).toBe(true);
  });

  it('graduates when BOTH paths are satisfied simultaneously (AUDIT-20260621-30)', () => {
    const f = threePhase();
    f.checkpointPhase('1');
    f.checkpointPhase('2');
    f.checkpointPhase('3');
    expect(evaluateCriterion(GRADUATE, ctxFor(f, true))).toBe(true);
  });

  it('the canonical opt-in: a STALE per-phase set is rescued by the whole-feature record (AUDIT-20260621-31)', () => {
    const f = threePhase();
    f.checkpointPhase('1');
    f.checkpointPhase('2');
    f.checkpointPhase('3');
    // The motivating O(n^2) scenario: a later edit re-stales an earlier phase's checkpoint.
    f.editPhaseFile('src/feat/b.ts', 'export const b = 222;\n');
    // Per-phase path is now false (phase 2 stale)...
    expect(evaluateCriterion(GRADUATE, ctxFor(f, false))).toBe(false);
    // ...but the opt-in whole-feature record rescues graduation (the central US6 use case).
    expect(evaluateCriterion(GRADUATE, ctxFor(f, true))).toBe(true);
  });
});
