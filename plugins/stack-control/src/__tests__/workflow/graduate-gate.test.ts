// 030 US2 (T026) — the SINGLE graduate criterion (FR-018, clean break). The
// per-phase graduate gate (all-phase-checkpoints-current, evaluatePhaseCheckpoints,
// composeConvergedImpl) is DELETED. `governing → shipped` is met IFF a converged
// whole-feature convergence record exists (ctx.implRecordConverged); nothing else
// — no per-phase checkpoints, no either-of — satisfies it (SC-002 = 0 per-phase
// surfaces).

import { describe, expect, it } from 'vitest';
import { evaluateCriterion, type GateContext } from '../../workflow/gate-eval.js';
import { CRITERION_KINDS, type Criterion } from '../../workflow/workflow-types.js';

const GRADUATE_IMPL: Criterion = { kind: 'graduate-impl', target: 'impl' };

function ctx(implRecordConverged: boolean): GateContext {
  return {
    installationRoot: '/x',
    item: 'multi:feature/x',
    designPointer: null,
    specPointer: 'specs/030-x',
    analyzeClean: true,
    designApproved: true,
    designRecordPath: null,
    specDirPath: '/x/specs/030-x',
    implRecordConverged,
    specRecordConverged: false,
    advanceTreeClean: true,
  };
}

describe('030 US2 — single graduate criterion (FR-018)', () => {
  it('graduate-impl is MET when a converged whole-feature record exists', () => {
    expect(evaluateCriterion(GRADUATE_IMPL, ctx(true))).toBe(true);
  });

  it('graduate-impl is UNMET with no converged record (no per-phase fallback)', () => {
    expect(evaluateCriterion(GRADUATE_IMPL, ctx(false))).toBe(false);
  });

  it('the all-phase-checkpoints-current criterion kind no longer exists', () => {
    expect(CRITERION_KINDS).not.toContain('all-phase-checkpoints-current');
  });
});
