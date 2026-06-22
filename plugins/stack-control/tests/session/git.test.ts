// 011 T004 (RED-first) — foundational git primitives shared by US2 (journal
// boundary + commit/push) and US4 (branch-staleness). Real git repos in tmp dirs
// (testing rule: never mock the filesystem / git). See research D3 (base
// resolution) + D5 (session boundary).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveBase, aheadBehind, sessionBoundary } from '../../src/session/git.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function commit(cwd: string, file: string, msg: string): string {
  writeFileSync(join(cwd, file), `${msg}\n`);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', msg);
  return git(cwd, 'rev-parse', 'HEAD');
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-git-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t.t');
  git(dir, 'config', 'user.name', 'T');
  // Tmp fixtures must be self-contained — don't inherit the host's commit
  // signing (the sandbox signing server rejects throwaway repos).
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'tag.gpgsign', 'false');
  return dir;
}

let dir: string;
// Extra tmp dirs (e.g. bare remotes) tracked so a failing assertion before an
// inline rmSync can't leak them (AUDIT-BARRAGE-claude-03).
let extraDirs: string[] = [];
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  for (const d of extraDirs) rmSync(d, { recursive: true, force: true });
  extraDirs = [];
});

describe('resolveBase', () => {
  it('returns the configured upstream when set', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'a');
    const remote = mkdtempSync(join(tmpdir(), 'sc-bare-'));
    git(remote, 'init', '-q', '--bare', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', remote);
    git(dir, 'push', '-q', '-u', 'origin', 'main');
    const r = resolveBase(dir);
    expect(r.kind).toBe('resolved');
    if (r.kind === 'resolved') expect(r.base).toBe('origin/main');
    rmSync(remote, { recursive: true, force: true });
  });

  it('is undeterminable when there is no upstream and no remote default', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'a');
    const r = resolveBase(dir);
    expect(r.kind).toBe('undeterminable');
  });

  it('is undeterminable on a detached HEAD with no base', () => {
    dir = initRepo();
    const sha = commit(dir, 'a.txt', 'a');
    commit(dir, 'b.txt', 'b');
    git(dir, 'checkout', '-q', sha); // detached
    const r = resolveBase(dir);
    expect(r.kind).toBe('undeterminable');
  });
});

describe('aheadBehind', () => {
  it('reports the behind count when the branch trails its base', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'a'); // shared
    git(dir, 'checkout', '-q', '-b', 'feature');
    git(dir, 'checkout', '-q', 'main');
    commit(dir, 'b.txt', 'b'); // main advances by 1
    commit(dir, 'c.txt', 'c'); // main advances by 2
    git(dir, 'checkout', '-q', 'feature');
    const ab = aheadBehind(dir, 'main');
    expect(ab.behind).toBe(2);
    expect(ab.ahead).toBe(0);
  });

  it('reports level (0/0) when the branch equals its base', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'a');
    git(dir, 'checkout', '-q', '-b', 'feature');
    const ab = aheadBehind(dir, 'main');
    expect(ab).toEqual({ ahead: 0, behind: 0 });
  });
});

describe('sessionBoundary', () => {
  it('returns the explicit --since ref resolved to a SHA when provided', () => {
    dir = initRepo();
    const first = commit(dir, 'a.txt', 'a');
    commit(dir, 'b.txt', 'b');
    const boundary = sessionBoundary(dir, { since: first });
    expect(boundary).toBe(first);
  });

  it('falls back to HEAD~N when no base and no explicit since', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'a');
    commit(dir, 'b.txt', 'b');
    const head = git(dir, 'rev-parse', 'HEAD');
    const boundary = sessionBoundary(dir, { fallbackN: 1 });
    // HEAD~1 of the 2-commit history is the first commit; boundary != HEAD.
    expect(boundary).not.toBe(head);
    expect(git(dir, 'rev-list', '--count', `${boundary}..HEAD`)).toBe('1');
  });

  // TASK-39: on a long-lived feature branch whose upstream is pushed up to HEAD
  // ("push early and often"), merge-base(upstream, HEAD) collapses to HEAD, so the
  // session window is empty and the journal reports "0 commits". The journal-anchored
  // boundary must instead start at the previous session-end (the last commit that
  // touched the journal), capturing this session's commits regardless of push state.
  it('anchors the boundary at the last journal-touching commit (TASK-39)', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'a'); // older history, before the previous session-end
    // Previous session-end commits the journal — this is the session boundary.
    const prevSessionEnd = commit(dir, 'DEVELOPMENT-NOTES.md', 'session-end record');
    // This session: 3 code commits, none touching the journal.
    commit(dir, 'c.txt', 'c');
    commit(dir, 'd.txt', 'd');
    commit(dir, 'e.txt', 'e');
    // Reproduce the collapse: a fully-pushed upstream tracking HEAD. Tracked for
    // cleanup so a failing assertion below can't leak the bare repo (claude-03).
    const remote = mkdtempSync(join(tmpdir(), 'sc-bare-'));
    extraDirs.push(remote);
    git(remote, 'init', '-q', '--bare', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', remote);
    git(dir, 'push', '-q', '-u', 'origin', 'main');

    const boundary = sessionBoundary(dir, { journalPath: join(dir, 'DEVELOPMENT-NOTES.md') });
    expect(boundary).toBe(prevSessionEnd);
    // The window now captures exactly this session's 3 commits.
    expect(git(dir, 'rev-list', '--count', `${boundary}..HEAD`)).toBe('3');
  });

  it('falls back to the base/HEAD~N heuristic when the journal has no commit history', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'a');
    commit(dir, 'b.txt', 'b');
    // journalPath points at a file never committed → no anchor → heuristic fallback.
    const boundary = sessionBoundary(dir, {
      journalPath: join(dir, 'DEVELOPMENT-NOTES.md'),
      fallbackN: 1,
    });
    expect(git(dir, 'rev-list', '--count', `${boundary}..HEAD`)).toBe('1');
  });
});
