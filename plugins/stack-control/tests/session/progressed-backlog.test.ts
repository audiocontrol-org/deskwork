// 011 T016 (RED-first) — "progressed this session" = backlog items REFERENCED in
// the session's commits (research D6), cross-referenced against the backlog
// list(). Surfaced as evidence only: 0 status transitions, NO GitHub-issue query
// (FR-009 / SC-006). US2.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { progressedBacklog } from '../../src/session/progressed-backlog.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
function commit(cwd: string, file: string, msg: string): void {
  writeFileSync(join(cwd, file), `${msg}\n`);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', msg);
}
function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-prog-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t.t');
  git(dir, 'config', 'user.name', 'T');
  git(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const ITEMS = [
  { id: 'TASK-1', title: 'a', status: 'To Do' },
  { id: 'TASK-2', title: 'b', status: 'To Do' },
  { id: 'TASK-3', title: 'c', status: 'To Do' },
];

describe('progressedBacklog', () => {
  it('surfaces only the items referenced in the session commits', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'base');
    const boundary = git(dir, 'rev-parse', 'HEAD');
    commit(dir, 'b.txt', 'feat: close TASK-1');
    commit(dir, 'c.txt', 'fix: progress on TASK-3 partial');

    const progressed = progressedBacklog({ cwd: dir, boundary, items: ITEMS });
    const ids = progressed.map((i) => i.id);
    expect(ids).toContain('TASK-1');
    expect(ids).toContain('TASK-3');
    expect(ids).not.toContain('TASK-2'); // never referenced
  });

  it('returns nothing when no commit references any backlog item', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'base');
    const boundary = git(dir, 'rev-parse', 'HEAD');
    commit(dir, 'b.txt', 'feat: unrelated work');
    expect(progressedBacklog({ cwd: dir, boundary, items: ITEMS })).toHaveLength(0);
  });

  it('does not transition status — surfaces the item with its current status verbatim', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'base');
    const boundary = git(dir, 'rev-parse', 'HEAD');
    commit(dir, 'b.txt', 'feat: TASK-2');
    const progressed = progressedBacklog({ cwd: dir, boundary, items: ITEMS });
    expect(progressed).toEqual([{ id: 'TASK-2', title: 'b', status: 'To Do' }]);
  });
});
