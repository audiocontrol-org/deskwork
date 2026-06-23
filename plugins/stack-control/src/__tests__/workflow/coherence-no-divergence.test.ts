// 032 US2 (T013/T014) — the compass-derived phase and the close gate's recorded-
// status read AGREE across the whole post-govern span: there is NO window where the
// compass reports a post-merge "ready to close" phase that `roadmap advance --to
// closed` refuses on stale status (the TASK-445 divergence), and NO window where the
// compass refuses close (validated gate unmet) while the CLI close path would let it
// through. Folds TASK-445 by construction (every post-merge derivation + the close
// gate read the same recorded status + the validated marker). RED first.

import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../_run-helpers.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { makeWorkflowFixture, type FixtureNode, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/x';
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});
function statusOf(f: WorkflowFixture): string {
  return loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!.status;
}

/** A fixture with a converged impl record + the given node, committed (so advance can commit). */
function converged(node: FixtureNode): WorkflowFixture {
  const f = makeWorkflowFixture([node], { git: true });
  fixtures.push(f);
  f.writeSpecTasks('specs/x', true);
  f.writeRecord({
    version: 1, mode: 'impl', item: ITEM, scopeFingerprint: 'abc', converged: true,
    recordedAt: '2026-06-23T00:00:00Z',
  });
  f.commitAll('govern: converged');
  return f;
}

describe('032 US2 — compass and close gate never disagree (SC-002, folds TASK-445)', () => {
  it('govern-converged but status in-flight: derives merging AND advance --to closed refuses (not shipped)', () => {
    const f = converged({ identifier: ITEM, status: 'in-flight', design: 'd', spec: 'specs/x', analyzeClean: true });
    // compass: the item is at merging (run ship), NOT a closeable post-merge phase.
    const status = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    expect(status.stdout).toContain('phase: merging');
    const compass = runCli(['workflow', 'compass', ITEM, '--intent', 'close'], { cwd: f.root });
    expect(compass.status).not.toBe(0); // close is NOT on-course from merging
    // close gate AGREES: advance --to closed refuses because status is not shipped.
    const close = runCli(['roadmap', 'advance', ITEM, '--to', 'closed'], { cwd: f.root });
    expect(close.status).not.toBe(0);
    expect(close.stdout + close.stderr).toMatch(/shipped/i);
    expect(statusOf(f)).toBe('in-flight'); // no divergence — nothing closed
  });

  it('shipped but NOT validated: derives validating AND BOTH the compass and advance --to closed refuse (need validated)', () => {
    const f = converged({ identifier: ITEM, status: 'shipped', design: 'd', spec: 'specs/x', analyzeClean: true });
    const status = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    expect(status.stdout).toContain('phase: validating');
    // compass close → ahead (the validating→closed gate `approval-marker validated` is unmet)
    const compass = runCli(['workflow', 'compass', ITEM, '--intent', 'close'], { cwd: f.root });
    expect(compass.status).not.toBe(0);
    expect(compass.stdout + compass.stderr).toMatch(/validated|exit gate/i);
    // close gate AGREES: advance --to closed refuses for a shipped-but-not-validated item.
    const close = runCli(['roadmap', 'advance', ITEM, '--to', 'closed', '--apply'], { cwd: f.root });
    expect(close.status).not.toBe(0);
    expect(close.stdout + close.stderr).toMatch(/validated/i);
    expect(statusOf(f)).toBe('shipped'); // NOT closed — the gates agree it is not closeable
  });

  it('shipped AND validated: compass close is on-course AND advance --to closed --apply succeeds', () => {
    const f = converged({ identifier: ITEM, status: 'shipped', design: 'd', spec: 'specs/x', analyzeClean: true, validated: true });
    const compass = runCli(['workflow', 'compass', ITEM, '--intent', 'close'], { cwd: f.root });
    expect(compass.status).toBe(0);
    expect(compass.stdout).toContain('verdict: on-course');
    const close = runCli(['roadmap', 'advance', ITEM, '--to', 'closed', '--apply'], { cwd: f.root });
    expect(close.status).toBe(0);
    expect(statusOf(f)).toBe('closed');
  });
});
