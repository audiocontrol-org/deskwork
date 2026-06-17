// 025 US1 (T006) — the per-phase graduate gate. RED first.
//
// contracts/graduate-gate.md: the `governing → shipped` gate is met IFF every
// tasks.md phase has a CURRENT per-phase checkpoint. A missing checkpoint, a stale
// checkpoint (content edited after the checkpoint), or a standalone whole-feature
// record alone do NOT satisfy it; the unmet verdict NAMES the offending phase
// (SC-001/SC-002, FR-001/FR-003). FR-004 fail-loud (no file list / zero phases)
// is covered in phase-enumeration.test.ts.

import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  evaluatePhaseCheckpoints,
  composeConvergedImpl,
} from '../../govern/compose-convergence.js';
import { evaluateCriterion, type GateContext } from '../../workflow/gate-eval.js';
import type { Criterion } from '../../workflow/workflow-types.js';
import {
  makeUnskippableFixture,
  type UnskippableFixture,
} from '../fixtures/workflow/unskippable-fixtures.js';

let fixtures: UnskippableFixture[] = [];
function threePhase(): UnskippableFixture {
  const f = makeUnskippableFixture({
    slug: '025-fixture',
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

const ALL_PHASE_CRITERION: Criterion = { kind: 'all-phase-checkpoints-current', target: 'impl' };

function ctxFor(f: UnskippableFixture): GateContext {
  return {
    installationRoot: f.root,
    item: 'multi:feature/x',
    designPointer: null,
    specPointer: f.specDirRel,
    analyzeClean: true,
    designApproved: true,
    designRecordPath: null,
    specDirPath: join(f.root, f.specDirRel),
    implRecordConverged: false,
    specRecordConverged: false,
    advanceTreeClean: true,
  };
}

describe('per-phase graduate gate (contracts/graduate-gate.md)', () => {
  it('2/3 checkpoints → unmet, names the missing phase 3 (SC-001)', () => {
    const f = threePhase();
    f.checkpointPhase('1');
    f.checkpointPhase('2');
    const result = evaluatePhaseCheckpoints(f.root, f.slug, f.tasksPath);
    expect(result.met).toBe(false);
    expect(result.unmet.map((u) => u.phaseId)).toEqual(['3']);
    expect(result.unmet[0]!.reason).toBe('missing');
    expect(evaluateCriterion(ALL_PHASE_CRITERION, ctxFor(f))).toBe(false);
  });

  it('all 3 checkpoints current → met', () => {
    const f = threePhase();
    f.checkpointPhase('1');
    f.checkpointPhase('2');
    f.checkpointPhase('3');
    const result = evaluatePhaseCheckpoints(f.root, f.slug, f.tasksPath);
    expect(result.met).toBe(true);
    expect(result.unmet).toEqual([]);
    expect(evaluateCriterion(ALL_PHASE_CRITERION, ctxFor(f))).toBe(true);
  });

  it('editing phase 2 after its checkpoint reopens the gate, naming phase 2 stale (SC-002)', () => {
    const f = threePhase();
    f.checkpointPhase('1');
    f.checkpointPhase('2');
    f.checkpointPhase('3');
    // Mutate phase 2's governed file → its scope fingerprint no longer matches.
    f.editPhaseFile('src/feat/b.ts', 'export const b = 222;\n');
    const result = evaluatePhaseCheckpoints(f.root, f.slug, f.tasksPath);
    expect(result.met).toBe(false);
    expect(result.unmet.map((u) => u.phaseId)).toEqual(['2']);
    expect(result.unmet[0]!.reason).toBe('stale');
    expect(evaluateCriterion(ALL_PHASE_CRITERION, ctxFor(f))).toBe(false);
  });

  it('a standalone whole-feature record but no per-phase checkpoints → unmet (FR-001)', () => {
    const f = threePhase();
    // A converged whole-feature record does NOT satisfy the per-phase gate.
    f.base.writeRecord({
      version: 1,
      mode: 'impl',
      item: 'multi:feature/x',
      scopeFingerprint: 'deadbeef',
      converged: true,
      recordedAt: '2026-06-16T00:00:00.000Z',
    });
    const result = evaluatePhaseCheckpoints(f.root, f.slug, f.tasksPath);
    expect(result.met).toBe(false);
    expect(result.unmet.map((u) => u.phaseId)).toEqual(['1', '2', '3']);
    expect(composeConvergedImpl(f.root, f.slug, f.tasksPath)).toBe(false);
  });
});
