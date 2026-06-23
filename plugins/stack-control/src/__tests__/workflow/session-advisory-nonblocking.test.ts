// 032 US3 (T020/SC-004) — session-start and session-end are ORTHOGONAL to the
// workflow: with a merged-but-status-in-flight item present they COMPLETE (exit 0)
// and surface it as a NON-BLOCKING advisory; they NEVER refuse (per
// `.claude/rules/session-skills-never-block.md`). The blocking gate lives at the
// workflow waypoints (compass + close), not here. Drives the real CLI. RED first.

import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../_run-helpers.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/dangling';
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

/** An installation with a merged-but-status-in-flight item: a committed impl
 * convergence record reachable from origin/main while the node status is in-flight. */
function danglingFixture(): WorkflowFixture {
  const f = makeWorkflowFixture([{ identifier: ITEM, status: 'in-flight' }], { git: true });
  fixtures.push(f);
  f.commitAll('seed');
  f.writeRecord({
    version: 1, mode: 'impl', item: ITEM, scopeFingerprint: 'abc', converged: true,
    recordedAt: '2026-06-23T00:00:00Z',
  });
  f.commitAll('govern: converged record');
  // origin/main points at the record commit → the record is reachable (merged off-rail).
  f.git(['update-ref', 'refs/remotes/origin/main', f.git(['rev-parse', 'HEAD']).trim()]);
  return f;
}

describe('032 US3 — session skills never block on a dangling item (T020/SC-004)', () => {
  it('session-start completes (exit 0) and surfaces the merged-but-status-in-flight advisory', () => {
    const f = danglingFixture();
    const r = runCli(['session-start'], { cwd: f.root });
    expect(r.status).toBe(0); // NEVER refuses
    expect(r.stdout).toMatch(/merged-but-status-in-flight/i);
    expect(r.stdout).toContain(ITEM);
  });

  it('session-end completes (exit 0 with --no-push) and surfaces the advisory; never refuses', () => {
    const f = danglingFixture();
    const r = runCli(['session-end', '--no-push'], { cwd: f.root });
    expect(r.status, r.stderr).toBe(0); // NEVER refuses (capture-only posture)
    expect(r.stdout).toMatch(/merged-but-status-in-flight/i);
    expect(r.stdout).toContain(ITEM);
  });
});
