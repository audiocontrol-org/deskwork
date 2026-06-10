// T009/T010 (RED-first, US1, 012) — the `stackctl backlog promote` verb end to
// end via the real CLI (runCli) against an isolated backlog store. Covers the
// dry-run/apply happy path for spec:/roadmap: targets (contract 1, 2, 11) and
// the full fail-loud exit-code matrix (contract 3, 4, 5, 6, 8). Never mocks the
// filesystem; asserts zero-write on every error path (SC-002).

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { tmpBacklog } from './helpers.js';

function runBacklog(args: string[], dir: string, cwd?: string) {
  return runCli(['backlog', ...args], { env: { STACKCTL_BACKLOG_DIR: dir }, cwd });
}

function snapshot(dir: string): string {
  const tasks = join(dir, 'backlog', 'tasks');
  return readdirSync(tasks)
    .sort()
    .map((f) => `${f}::${readFileSync(join(tasks, f), 'utf8')}`)
    .join('\n');
}

function taskFileFor(dir: string, id: string): string {
  const tasks = join(dir, 'backlog', 'tasks');
  const n = id.replace('TASK-', '');
  return readFileSync(join(tasks, readdirSync(tasks).find((f) => f.startsWith(`task-${n} -`))!), 'utf8');
}

describe('backlog promote — dry-run/apply happy path (T009, contract 1/2/11)', () => {
  it('dry-run reports the intended linkage and writes nothing (contract 1)', () => {
    const dir = tmpBacklog();
    const id = createBacklogBackend({ cwd: dir }).create({ title: 'x', labels: ['agent-found', 'type:gap'] });
    const before = snapshot(dir);

    const r = runBacklog(['promote', id, '--to', 'spec:specs/012-backlog-promotion-seam'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/dry-run/);
    expect(r.stdout).toContain('spec:specs/012-backlog-promotion-seam');
    expect(snapshot(dir)).toBe(before);
  });

  it('--apply records the promoted label + Promoted-to linkage (contract 2)', () => {
    const dir = tmpBacklog();
    const id = createBacklogBackend({ cwd: dir }).create({
      title: 'x',
      labels: ['agent-found', 'type:gap'],
      refs: ['gh-7'],
    });

    const r = runBacklog(['promote', id, '--to', 'spec:specs/012-backlog-promotion-seam', '--apply'], dir);
    expect(r.status).toBe(0);

    const file = taskFileFor(dir, id);
    expect(file).toMatch(/labels:[\s\S]*promoted/);
    expect(file).toMatch(/references:[\s\S]*gh-7/); // preserved
    expect(file).toContain('**Promoted-to:** spec:specs/012-backlog-promotion-seam');
  });

  it('a roadmap: target records the correctly-typed ref (contract 11)', () => {
    const dir = tmpBacklog();
    const id = createBacklogBackend({ cwd: dir }).create({ title: 'x', labels: ['agent-found', 'type:bug'] });

    const r = runBacklog(['promote', id, '--to', 'roadmap:impl:feature/execution-engine', '--apply'], dir);
    expect(r.status).toBe(0);
    expect(taskFileFor(dir, id)).toContain('**Promoted-to:** roadmap:impl:feature/execution-engine');
  });
});

describe('backlog promote — fail-loud exit-code matrix (T010, contract 3/4/5/6/8)', () => {
  it('a non-existent item → exit 1, zero write (contract 3)', () => {
    const dir = tmpBacklog();
    createBacklogBackend({ cwd: dir }).create({ title: 'present', labels: ['agent-found', 'type:gap'] });
    const before = snapshot(dir);

    const r = runBacklog(['promote', 'TASK-999', '--to', 'spec:specs/012-x', '--apply'], dir);
    expect(r.status).toBe(1);
    expect(snapshot(dir)).toBe(before);
  });

  it('a malformed task file for the target id → exit 1, zero write (contract 4)', () => {
    const dir = tmpBacklog();
    // A task file the projection cannot parse (no closing frontmatter / no id).
    mkdirSync(join(dir, 'backlog', 'tasks'), { recursive: true });
    writeFileSync(join(dir, 'backlog', 'tasks', 'task-1 - broken.md'), 'not valid frontmatter at all\n');
    const before = snapshot(dir);

    const r = runBacklog(['promote', 'TASK-1', '--to', 'spec:specs/012-x', '--apply'], dir);
    expect(r.status).toBe(1);
    expect(snapshot(dir)).toBe(before);
  });

  it('a corrupt UNRELATED task file in the store refuses promote with zero write (AUDIT codex-02, FR-009/spec:87)', () => {
    const dir = tmpBacklog();
    const id = createBacklogBackend({ cwd: dir }).create({ title: 'valid', labels: ['agent-found', 'type:gap'] });
    // A second, corrupt task file the projection cannot parse — the store is malformed.
    writeFileSync(join(dir, 'backlog', 'tasks', 'task-99 - corrupt.md'), 'garbage not frontmatter\n');
    const before = snapshot(dir);

    const r = runBacklog(['promote', id, '--to', 'spec:specs/012-backlog-promotion-seam', '--apply'], dir);
    expect(r.status).toBe(1); // fail loud on a malformed store — never mask corruption during a governance op
    expect(r.stderr).toMatch(/malformed|corrupt/i);
    expect(snapshot(dir)).toBe(before); // the valid item is NOT promoted
  });

  it('missing --to → exit 2 (contract 5)', () => {
    const dir = tmpBacklog();
    const id = createBacklogBackend({ cwd: dir }).create({ title: 'x', labels: ['agent-found', 'type:gap'] });
    expect(runBacklog(['promote', id], dir).status).toBe(2);
  });

  it('a malformed/unknown target ref → exit 2 (contract 6)', () => {
    const dir = tmpBacklog();
    const id = createBacklogBackend({ cwd: dir }).create({ title: 'x', labels: ['agent-found', 'type:gap'] });
    expect(runBacklog(['promote', id, '--to', 'issue:gh-1', '--apply'], dir).status).toBe(2);
  });

  it('multiple ids with a non-tasks: target → exit 2, zero write (contract 8)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const a = backend.create({ title: 'a', labels: ['agent-found', 'type:gap'] });
    const b = backend.create({ title: 'b', labels: ['agent-found', 'type:gap'] });
    const before = snapshot(dir);

    const r = runBacklog(['promote', a, b, '--to', 'spec:specs/012-x', '--apply'], dir);
    expect(r.status).toBe(2);
    expect(snapshot(dir)).toBe(before);
  });

  it('no item-id given → exit 2 (contract: no item-id)', () => {
    const dir = tmpBacklog();
    expect(runBacklog(['promote', '--to', 'spec:specs/012-x'], dir).status).toBe(2);
  });
});

describe('backlog promote — batch tasks: + advisory (T013/T014, US2, contract 9/10)', () => {
  it('batch tasks: with all-valid ids records every item (apply, contract 9)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const a = backend.create({ title: 'a', labels: ['agent-found', 'type:gap'] });
    const b = backend.create({ title: 'b', labels: ['agent-found', 'type:gap'] });

    const r = runBacklog(['promote', a, b, '--to', 'tasks:specs/008-backlog-surface', '--apply'], dir);
    expect(r.status).toBe(0);
    expect(taskFileFor(dir, a)).toMatch(/labels:[\s\S]*promoted/);
    expect(taskFileFor(dir, b)).toMatch(/labels:[\s\S]*promoted/);
  });

  it('one invalid id in a batch refuses the WHOLE batch with zero write (contract 9, SC-002)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const a = backend.create({ title: 'a', labels: ['agent-found', 'type:gap'] });
    const before = snapshot(dir);

    // a is valid, TASK-999 is not → all-or-nothing: nothing is written.
    const r = runBacklog(['promote', a, 'TASK-999', '--to', 'tasks:specs/008-backlog-surface', '--apply'], dir);
    expect(r.status).toBe(1);
    expect(snapshot(dir)).toBe(before);
  });

  it('one already-promoted id in a batch refuses the whole batch (zero write, FR-006)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const a = backend.create({ title: 'a', labels: ['agent-found', 'type:gap'] });
    const b = backend.create({ title: 'b', labels: ['agent-found', 'type:gap'] });
    runBacklog(['promote', a, '--to', 'tasks:specs/008-backlog-surface', '--apply'], dir); // promote a first
    const afterFirst = snapshot(dir);

    const r = runBacklog(['promote', a, b, '--to', 'tasks:specs/008-backlog-surface', '--apply'], dir);
    expect(r.status).toBe(2); // already-promoted → usage refusal
    expect(snapshot(dir)).toBe(afterFirst); // b never got written
  });

  it('a target path that does not yet exist is recorded with a pending-create advisory, exit 0 (contract 10)', () => {
    const dir = tmpBacklog();
    const id = createBacklogBackend({ cwd: dir }).create({ title: 'x', labels: ['agent-found', 'type:gap'] });
    const cwd = mkdtempSync(join(tmpdir(), 'promote-cwd-')); // no specs/ tree → target absent

    const r = runBacklog(['promote', id, '--to', 'tasks:specs/099-not-yet', '--apply'], dir, cwd);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/does not yet exist/);
    expect(taskFileFor(dir, id)).toMatch(/labels:[\s\S]*promoted/); // still recorded
  });

  it('a duplicate id in a batch is refused with zero write (AUDIT codex-01)', () => {
    const dir = tmpBacklog();
    const id = createBacklogBackend({ cwd: dir }).create({ title: 'a', labels: ['agent-found', 'type:gap'] });
    const before = snapshot(dir);

    const r = runBacklog(['promote', id, id, '--to', 'tasks:specs/008-backlog-surface', '--apply'], dir);
    expect(r.status).toBe(2); // usage: a repeated id would double-write the linkage
    expect(snapshot(dir)).toBe(before); // zero write
  });

  it('a target path that exists yields NO pending-create advisory (D4)', () => {
    const dir = tmpBacklog();
    const id = createBacklogBackend({ cwd: dir }).create({ title: 'x', labels: ['agent-found', 'type:gap'] });
    const cwd = mkdtempSync(join(tmpdir(), 'promote-cwd-'));
    mkdirSync(join(cwd, 'specs', '008-backlog-surface'), { recursive: true });

    const r = runBacklog(['promote', id, '--to', 'tasks:specs/008-backlog-surface'], dir, cwd);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/does not yet exist/);
  });
});
