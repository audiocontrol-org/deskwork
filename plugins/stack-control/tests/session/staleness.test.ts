// 011 T027 (RED-first) — branch-staleness advisory (research D3): behind its base
// → advisory with a count; level/ahead → no warning; detached HEAD / no base →
// clean skip with a note. In ALL cases the session still starts — staleness never
// blocks (FR-016/FR-017/SC-005). US4.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkStaleness } from '../../src/session/staleness.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
function commit(cwd: string, file: string, msg: string): void {
  writeFileSync(join(cwd, file), `${msg}\n`);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', msg);
}
function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-stale-'));
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

describe('checkStaleness', () => {
  it('reports behind with a count when the branch trails its base', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'a'); // shared
    git(dir, 'checkout', '-q', '-b', 'feature');
    git(dir, 'branch', '--set-upstream-to=main', 'feature');
    git(dir, 'checkout', '-q', 'main');
    commit(dir, 'b.txt', 'b');
    commit(dir, 'c.txt', 'c'); // main advances by 2
    git(dir, 'checkout', '-q', 'feature');

    const signal = checkStaleness(dir);
    expect(signal.kind).toBe('behind');
    if (signal.kind === 'behind') {
      expect(signal.behindCount).toBe(2);
      expect(signal.base).toBe('main');
    }
  });

  it('reports current when the branch is level with its base', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'a');
    git(dir, 'checkout', '-q', '-b', 'feature');
    git(dir, 'branch', '--set-upstream-to=main', 'feature');
    expect(checkStaleness(dir).kind).toBe('current');
  });

  it('skips cleanly (with a reason) when no base can be determined', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'a'); // no upstream, no remote
    const signal = checkStaleness(dir);
    expect(signal.kind).toBe('skipped');
    if (signal.kind === 'skipped') expect(signal.reason.length).toBeGreaterThan(0);
  });

  it('skips cleanly on a detached HEAD (never errors)', () => {
    dir = initRepo();
    const sha = commit2(dir);
    git(dir, 'checkout', '-q', sha);
    expect(checkStaleness(dir).kind).toBe('skipped');
  });
});

function commit2(dir: string): string {
  commit(dir, 'a.txt', 'a');
  const sha = git(dir, 'rev-parse', 'HEAD');
  commit(dir, 'b.txt', 'b');
  return sha;
}
