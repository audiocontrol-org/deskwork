// 032 US3 (AUDIT-20260623-06) — the off-rail backstop must also guard the MUTATING
// `workflow advance` path, not only the compass + close step. `workflow advance` is a
// stackctl lifecycle surface (not raw git/gh), so an agent could otherwise advance an
// unrelated item forward while a merged-but-status-in-flight item dangles — bypassing the
// "refuses forward lifecycle motion at the next workflow waypoint" guarantee. The
// dangling item's OWN advance (the reconcile) stays exempt. RED first.

import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../_run-helpers.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const OTHER = 'multi:feature/other';
const DANGLING = 'multi:feature/dangling';
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});
function statusOf(f: WorkflowFixture, id: string): string {
  return loadRoadmap(f.roadmapPath, f.opts).byId.get(id)!.status;
}

/** A fixture with an advanceable OTHER item + a dangling merged item (record reachable from base). */
function fixture(): WorkflowFixture {
  const f = makeWorkflowFixture(
    [
      { identifier: OTHER, status: 'planned' },
      { identifier: DANGLING, status: 'in-flight' },
    ],
    { git: true },
  );
  fixtures.push(f);
  f.commitAll('seed');
  f.writeRecord({
    version: 1, mode: 'impl', item: DANGLING, scopeFingerprint: 'abc', converged: true,
    recordedAt: '2026-06-23T00:00:00Z',
  });
  f.commitAll('govern: converged (dangling)');
  f.git(['update-ref', 'refs/remotes/origin/main', f.git(['rev-parse', 'HEAD']).trim()]);
  return f;
}

describe('032 US3 — workflow advance shares the backstop (AUDIT-20260623-06)', () => {
  it('REFUSES `workflow advance` on an UNRELATED item while a dangling merged item exists', () => {
    const f = fixture();
    const r = runCli(['workflow', 'advance', OTHER, '--apply'], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain(DANGLING);
    expect(r.stdout + r.stderr).toMatch(/merged-but-status-in-flight|reconcile/i);
    expect(statusOf(f, OTHER)).toBe('planned'); // did NOT advance
  });

  it('ALLOWS the dangling item its OWN advance (the reconcile records status:shipped)', () => {
    const f = fixture();
    const r = runCli(['workflow', 'advance', DANGLING, '--apply'], { cwd: f.root });
    expect(r.status, r.stderr).toBe(0); // the reconcile is exempt
    expect(statusOf(f, DANGLING)).toBe('shipped');
  });

  it('once reconciled, `workflow advance` on the other item proceeds', () => {
    const f = fixture();
    runCli(['workflow', 'advance', DANGLING, '--apply'], { cwd: f.root }); // reconcile
    const r = runCli(['workflow', 'advance', OTHER, '--apply'], { cwd: f.root });
    expect(r.status, r.stderr).toBe(0);
    expect(statusOf(f, OTHER)).toBe('in-flight'); // open-design advanced planned → designing (status in-flight)
  });
});
