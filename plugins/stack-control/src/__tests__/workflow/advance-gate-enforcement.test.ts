// 024 US5 / FR-010 (phased) — gates become refusals where this feature enforces:
// the back-half `governing → shipped` (terminal) transition REFUSES on an unmet
// exit gate rather than only reporting it; mid-pipeline transitions stay ADVISORY
// in the engine's advance path during migration. RED first (T033).

import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../_run-helpers.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';
import {
  makeUnskippableFixture,
  type UnskippableFixture,
} from '../fixtures/workflow/unskippable-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/x';
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});
function statusOf(f: UnskippableFixture): string {
  return loadRoadmap(f.base.roadmapPath, f.base.opts).byId.get(ITEM)!.status;
}

/**
 * An item derived at `governing`: a phased tasks.md 100% complete (→ governing), with
 * per-phase checkpoints absent by default — the 025 graduate gate
 * (all-phase-checkpoints-current impl) is then unmet until checkpoints are written.
 */
function governingFixture(): UnskippableFixture {
  const f = makeUnskippableFixture({
    slug: 'x',
    node: { identifier: ITEM, status: 'in-flight', design: 'd', spec: 'specs/x', analyzeClean: true },
    phases: [{ id: '1', files: [{ path: 'src/x/p1.ts', content: 'export const p1 = 1;\n' }] }],
    tasksComplete: true,
    git: true,
  });
  fixtures.push(f.base);
  f.base.commitAll('seed');
  return f;
}

describe('025 US1 — governing → shipped refuses without current per-phase checkpoints', () => {
  it('REFUSES to graduate when a phase has no current checkpoint, naming the criterion', () => {
    const f = governingFixture(); // no checkpoints written → gate unmet
    const r = runCli(['workflow', 'advance', ITEM, '--apply'], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/refus/i);
    // 029 US6: the graduate gate is the either-of `graduate-impl` criterion (per-phase
    // checkpoints OR a whole-feature record); with neither present it still refuses.
    expect(r.stdout + r.stderr).toMatch(/graduate-impl/);
    expect(statusOf(f)).toBe('in-flight'); // did NOT advance to shipped
  });

  it('once every per-phase checkpoint is current (gate met), graduation reaches shipped', () => {
    const f = governingFixture();
    f.checkpointPhase('1'); // the only phase now has a current checkpoint → gate met
    f.base.commitAll('checkpoint');
    const r = runCli(['workflow', 'advance', ITEM, '--apply'], { cwd: f.root });
    expect(r.status).toBe(0); // gate met → graduation applies
    const s = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    expect(s.status).toBe(0);
    expect(s.stdout).toContain('phase: shipped');
  });
});

describe('024 US5 — mid-pipeline transitions stay advisory (phased FR-010)', () => {
  it('a mid-pipeline advance with an unmet gate still applies (advisory, not refused)', () => {
    // implementing with tasks INCOMPLETE → start-governing exit gate (tasks-complete) unmet,
    // but mid-pipeline is advisory during migration → it applies.
    const f = makeWorkflowFixture(
      [{ identifier: ITEM, status: 'in-flight', design: 'd', spec: 'specs/x', analyzeClean: true }],
      { git: true },
    );
    fixtures.push(f);
    f.writeSpecTasks('specs/x', false); // tasks incomplete → implementing
    f.commitAll('seed');
    const r = runCli(['workflow', 'advance', ITEM, '--apply'], { cwd: f.root });
    expect(r.status).toBe(0); // advisory: not refused
    expect(r.stdout).toContain('applied start-governing');
  });
});
