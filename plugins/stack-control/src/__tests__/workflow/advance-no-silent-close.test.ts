// AUDIT-20260623-01 (RED-first, 031) — `stackctl workflow advance` MUST NOT
// provide a second, silent path into the terminal `closed` phase. The generic
// workflow-advance effect (`roadmap-advance to=closed`) is a status-only rewrite
// that does NOT run the transitive cascade — so advancing a shipped item to
// `closed` via `workflow advance` would mark it closed while leaving every
// recorded backlog id open, bypassing the feature's core operator-confirmed
// cascade. The ONLY executable close path is `stackctl roadmap advance --to
// closed` (which closes the contained ids AND advances). `workflow advance` into
// `closed` must refuse and redirect.

import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../_run-helpers.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/shipped-thing';
function shippedFixture(): WorkflowFixture {
  const f = makeWorkflowFixture([{ identifier: ITEM, status: 'shipped' }], { git: true });
  fixtures.push(f);
  f.commitAll('seed');
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});
function statusOf(f: WorkflowFixture): string {
  return loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!.status;
}

describe('workflow advance — no silent close (AUDIT-20260623-01)', () => {
  it('--apply into closed is REFUSED and the status stays shipped (no status-only close)', () => {
    const f = shippedFixture();
    const r = runCli(['workflow', 'advance', ITEM, '--apply'], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/roadmap advance .*--to closed|stack-control:close/);
    expect(statusOf(f)).toBe('shipped'); // NOT silently advanced to closed
  });

  it('dry-run into closed is also refused (the redirect, not a previewed status rewrite)', () => {
    const f = shippedFixture();
    const r = runCli(['workflow', 'advance', ITEM], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(statusOf(f)).toBe('shipped');
  });
});
