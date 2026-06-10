// T009/T010 (RED-first, US1, 012) — the `stackctl backlog promote` verb end to
// end via the real CLI (runCli) against an isolated backlog store. Covers the
// dry-run/apply happy path for spec:/roadmap: targets (contract 1, 2, 11) and
// the full fail-loud exit-code matrix (contract 3, 4, 5, 6, 8). Never mocks the
// filesystem; asserts zero-write on every error path (SC-002).

import { describe, it, expect } from 'vitest';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { tmpBacklog } from './helpers.js';

function runBacklog(args: string[], dir: string) {
  return runCli(['backlog', ...args], { env: { STACKCTL_BACKLOG_DIR: dir } });
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
