// 030 US2 (FR-018) — the graduate gate is the SINGLE whole-feature record criterion.
// The 029 either-of arm (per-phase checkpoints OR whole-feature record) is COLLAPSED:
// per-phase checkpoints no longer graduate anything; `governing → shipped` is met IFF a
// converged whole-feature convergence record exists (read via implRecordConverged).
//
// On-disk fixtures via makeUnskippableFixture (multi-phase scaffold), per testing.md.

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

describe('030 US2 — graduate gate is the single whole-feature record criterion (FR-018)', () => {
  it('graduates via a converged whole-feature record', () => {
    const f = threePhase();
    expect(evaluateCriterion(GRADUATE, ctxFor(f, true))).toBe(true);
  });

  it('does NOT graduate without a converged whole-feature record', () => {
    const f = threePhase();
    expect(evaluateCriterion(GRADUATE, ctxFor(f, false))).toBe(false);
  });

  it('graduates on the whole-feature record even when no spec dir resolves (AUDIT-20260621-29)', () => {
    const f = threePhase();
    // specDirPath = null → there is no per-phase structure to consult; the whole-feature
    // record alone graduates.
    const ctx = { ...ctxFor(f, true), specDirPath: null, specPointer: null };
    expect(evaluateCriterion(GRADUATE, ctx)).toBe(true);
  });
});
