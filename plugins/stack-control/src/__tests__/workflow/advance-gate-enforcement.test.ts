// 024 US5 / FR-010 (phased) — gates become refusals where this feature enforces:
// the back-half `governing → shipped` (terminal) transition REFUSES on an unmet
// exit gate rather than only reporting it; mid-pipeline transitions stay ADVISORY
// in the engine's advance path during migration. RED first (T033).

import { afterEach, describe, expect, it } from 'vitest';
import { realpathSync } from 'node:fs';
import { runCli } from '../_run-helpers.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { writeGovernConvergenceRecord } from '../../govern/convergence-record.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/x';
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});
function statusOf(f: WorkflowFixture): string {
  return loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!.status;
}

/** An item derived at `governing`: tasks 100% complete, no impl convergence record yet. */
function governingFixture(): WorkflowFixture {
  const f = makeWorkflowFixture(
    [{ identifier: ITEM, status: 'in-flight', design: 'd', spec: 'specs/x', analyzeClean: true }],
    { git: true },
  );
  fixtures.push(f);
  f.writeSpecTasks('specs/x', true); // tasks complete → governing
  f.commitAll('seed');
  return f;
}

describe('024 US5 — governing → shipped refuses on an unmet exit gate', () => {
  it('REFUSES to graduate without the impl convergence record, naming the unmet criterion', () => {
    const f = governingFixture();
    const r = runCli(['workflow', 'advance', ITEM, '--apply'], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/refus/i);
    expect(r.stdout + r.stderr).toMatch(/record-converged impl/);
    expect(statusOf(f)).toBe('in-flight'); // did NOT advance to shipped
  });

  it('once the impl convergence record is recorded (gate met), the item is shipped', () => {
    const f = governingFixture();
    // Stamp anchorRoot at the realpathed root the spawned CLI resolves to (the OS
    // tmpdir is a /var → /private/var symlink); the anchorRoot validation is a real
    // feature and the test must write the record under the path the CLI reads.
    writeGovernConvergenceRecord(realpathSync(f.root), {
      version: 1,
      mode: 'impl',
      item: ITEM, // canonical node-id key (FR-013)
      scopeFingerprint: 'fp',
      converged: true,
      recordedAt: '2026-06-16T00:00:00.000Z',
    });
    f.commitAll('record');
    // The `shipped` phase derives from `record-converged impl` — the same fact the
    // graduate exit gate requires — so a met gate IS the terminal state (the gate-met
    // path reaches shipped; it is never refused). Verify via the read-only status verb.
    const r = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('phase: shipped');
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
