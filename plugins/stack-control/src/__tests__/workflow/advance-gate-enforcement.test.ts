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
 * An item derived at `governing`: a tasks.md 100% complete (→ governing), with NO
 * converged whole-feature record by default — the 030 graduate gate (graduate-impl =
 * a converged whole-feature convergence record alone, FR-018) is then unmet until the
 * record is written.
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

describe('030 US2 — governing → shipped requires a converged whole-feature record (FR-018)', () => {
  it('REFUSES to graduate with no converged record, naming the criterion', () => {
    const f = governingFixture(); // no convergence record → gate unmet
    const r = runCli(['workflow', 'advance', ITEM, '--apply'], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/refus/i);
    expect(r.stdout + r.stderr).toMatch(/graduate-impl/); // the single graduate criterion
    expect(statusOf(f)).toBe('in-flight'); // did NOT advance to shipped
  });

  it('once a converged whole-feature record exists, the item graduates to shipped', () => {
    const f = governingFixture();
    // NB: for `mode: 'impl'`, the fixture's writeRecord maps this record-shaped input
    // through `implRecordFrom(...)` and persists a real `WholeFeatureConvergenceRecord`
    // (workflow-fixtures.ts) — these are adapter INPUTS, NOT the on-disk schema. The
    // graduate gate reads the mapped whole-feature record, not these literal fields.
    f.base.writeRecord({
      version: 1,
      mode: 'impl',
      item: ITEM,
      scopeFingerprint: 'deadbeef',
      converged: true,
      recordedAt: '2026-06-21T00:00:00.000Z',
    });
    f.base.commitAll('govern: converged whole-feature record');
    // The converged record satisfies graduate-impl AND derives phase:shipped (the same
    // single criterion now), so the item is graduated — no per-phase checkpoints involved.
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
