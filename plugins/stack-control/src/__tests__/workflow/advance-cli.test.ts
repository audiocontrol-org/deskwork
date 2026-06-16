// US4 (022) — the `workflow advance` / `link-design` / `link-spec` CLI surface
// (T022): dry-run by default, --apply commits, link verbs set the node pointers.

import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../_run-helpers.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/x';
function gitFixture(): WorkflowFixture {
  const f = makeWorkflowFixture([{ identifier: ITEM, status: 'planned' }], { git: true });
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

describe('workflow advance — CLI', () => {
  it('dry-run by default previews the transition and writes nothing', () => {
    const f = gitFixture();
    const r = runCli(['workflow', 'advance', ITEM], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('dry-run');
    expect(r.stdout).toContain('open-design (planned -> designing)');
    expect(statusOf(f)).toBe('planned');
  });

  it('--apply fires the effect manifest and commits', () => {
    const f = gitFixture();
    const r = runCli(['workflow', 'advance', ITEM, '--apply'], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('applied open-design');
    expect(statusOf(f)).toBe('in-flight');
    expect(f.git(['status', '--porcelain']).trim()).toBe('');
  });
});

describe('workflow link-design / link-spec — CLI', () => {
  it('link-design --apply sets the design: pointer', () => {
    const f = gitFixture();
    const r = runCli(['workflow', 'link-design', ITEM, 'docs/x-design.md', '--apply'], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!.design).toBe('docs/x-design.md');
  });

  it('link-spec dry-run does not write', () => {
    const f = gitFixture();
    const r = runCli(['workflow', 'link-spec', ITEM, 'specs/022-x'], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('dry-run');
    expect(loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!.spec).toBeNull();
  });
});
