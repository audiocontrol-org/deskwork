// T007 (RED-first, Foundational, 008) — the `backlog` verb dispatcher shell +
// read-only `list` (the shell's natural adapter-load path; T014/T015 pulled
// forward so "subactions route" is asserted honestly with no stub handler, the
// way tests/inbox/verb-inbox.test.ts pulled list into the foundational layer).
// capture cases (T011) and import cases (T017/T023) append to their own files.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { tmpBacklog } from './helpers.js';

/** Run the backlog verb with the backlog root pointed at an isolated dir. */
function runBacklog(args: string[], dir: string) {
  return runCli(['backlog', ...args], { env: { STACKCTL_BACKLOG_DIR: dir } });
}

describe('stackctl backlog verb shell (T007)', () => {
  it('no subaction → exit 2', () => {
    expect(runBacklog([], tmpBacklog()).status).toBe(2);
  });

  it('unknown subaction → exit 2 with a descriptive message', () => {
    const r = runBacklog(['frobnicate'], tmpBacklog());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('frobnicate');
  });

  it('unknown flag on a known subaction → exit 2', () => {
    const r = runBacklog(['list', '--bogus', 'x'], tmpBacklog());
    expect(r.status).toBe(2);
  });

  it('a required value-flag missing its value → exit 2 with a descriptive message', () => {
    const r = runBacklog(['capture', 'a title', '--type'], tmpBacklog());
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/type/);
  });
});

describe('stackctl backlog list (T014/T015 pulled into Foundational, read-only)', () => {
  it('lists each item id + status + type and writes nothing', () => {
    const dir = tmpBacklog();
    // Seed via the adapter (capture verb is wired in US1); list must surface them.
    const backend = createBacklogBackend({ cwd: dir });
    backend.create({ title: 'first found bug', labels: ['agent-found', 'type:bug'], refs: ['gh-1'] });
    backend.create({ title: 'a gap', labels: ['agent-found', 'type:gap'] });

    const r = runBacklog(['list'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/TASK-\d+/);
    expect(r.stdout).toMatch(/bug/);
    expect(r.stdout).toMatch(/gap/);
    expect(r.stdout).toMatch(/To Do/);
  });

  it('configured-but-empty pile → exit 0, reports zero items', () => {
    const r = runBacklog(['list'], tmpBacklog());
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/0 item/);
  });

  it('no backlog project (missing backlog/config.yml) → exit 2 with remediation', () => {
    const noProject = mkdtempSync(join(tmpdir(), 'backlog-noproj-'));
    const r = runBacklog(['list'], noProject);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/backlog/i);
  });
});

// T014 (US2) — list is a tier DISTINCT from the curated roadmap (FR-008) and is
// strictly read-only (FR-007). list was pulled into the foundational layer
// (T015 done in T008); these are the US2-specific coverage assertions.
describe('stackctl backlog list — tier distinct + read-only (US2, T014)', () => {
  it('reports only backlog items, never ROADMAP.md entries (tier distinct, FR-008)', () => {
    const dir = tmpBacklog();
    writeFileSync(
      join(dir, 'ROADMAP.md'),
      '# Roadmap\n\n## design:feature/curated-thing\n- status: planned\nA curated roadmap entry.\n',
    );
    const backend = createBacklogBackend({ cwd: dir });
    backend.create({ title: 'a found bug', labels: ['agent-found', 'type:bug'], refs: ['gh-1'] });

    const r = runBacklog(['list'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/a found bug/);
    expect(r.stdout).not.toMatch(/curated-thing/);
    expect(r.stdout).not.toMatch(/Roadmap/);
  });

  it('writes nothing — the backlog tree is byte-identical after a list (FR-007)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    backend.create({ title: 'item', labels: ['agent-found', 'type:gap'] });
    const tasksDir = join(dir, 'backlog', 'tasks');
    const snapshot = readdirSync(tasksDir)
      .map((f) => `${f}::${readFileSync(join(tasksDir, f), 'utf8')}`)
      .join('\n');

    expect(runBacklog(['list'], dir).status).toBe(0);

    const after = readdirSync(tasksDir)
      .map((f) => `${f}::${readFileSync(join(tasksDir, f), 'utf8')}`)
      .join('\n');
    expect(after).toBe(snapshot);
  });
});
