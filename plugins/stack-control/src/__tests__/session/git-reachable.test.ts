// 032 US3 (T016) — `isReachableFromBase(commit, cwd)`: the git primitive the
// off-rail merge backstop keys on. Returns true iff <commit> is an ancestor of the
// resolved base (origin/main, via resolveBase); false when it is not; null when the
// base is undeterminable (detached HEAD / no remote) — fail-open for detection, so a
// no-remote installation never produces a false refusal. RED first.

import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isReachableFromBase } from '../../session/git.js';

let repos: string[] = [];
function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}
function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'reachable-'));
  repos.push(root);
  git(root, 'init', '--initial-branch=main', '-q');
  git(root, 'config', 'user.email', 'r@example.invalid');
  git(root, 'config', 'user.name', 'reachable');
  git(root, 'config', 'commit.gpgsign', 'false');
  return root;
}
function commit(root: string, file: string, msg: string): string {
  writeFileSync(join(root, file), `${msg}\n`, 'utf8');
  git(root, 'add', file);
  git(root, 'commit', '-q', '-m', msg);
  return git(root, 'rev-parse', 'HEAD');
}
afterEach(() => {
  for (const r of repos) rmSync(r, { recursive: true, force: true });
  repos = [];
});

describe('032 US3 — isReachableFromBase (T016)', () => {
  it('returns true when the commit is an ancestor of the resolved base (origin/main)', () => {
    const root = makeRepo();
    const a = commit(root, 'a.txt', 'A');
    const b = commit(root, 'b.txt', 'B');
    // Simulate a merge to the default branch: origin/main points at B; A is an ancestor.
    git(root, 'update-ref', 'refs/remotes/origin/main', b);
    expect(isReachableFromBase(a, root)).toBe(true);
    expect(isReachableFromBase(b, root)).toBe(true);
  });

  it('returns false when the commit is NOT an ancestor of the base (sibling branch tip)', () => {
    const root = makeRepo();
    const a = commit(root, 'a.txt', 'A');
    git(root, 'update-ref', 'refs/remotes/origin/main', a); // base = A
    // diverge: a commit off A that never landed in origin/main
    git(root, 'checkout', '-q', '-b', 'feature');
    const c = commit(root, 'c.txt', 'C');
    expect(isReachableFromBase(c, root)).toBe(false);
  });

  it('returns null when the base is undeterminable (no remote default branch)', () => {
    const root = makeRepo();
    const a = commit(root, 'a.txt', 'A');
    // no origin/main, no upstream → resolveBase undeterminable
    expect(isReachableFromBase(a, root)).toBeNull();
  });
});
