// 030 follow-up (dogfood TASK-#2) — implement-mode whole-feature govern must
// default its diff base to the FEATURE FORK POINT (merge-base with the repo
// default branch), not HEAD~1. HEAD~1 audits only the last commit, so a bare
// `stackctl govern --mode implement` silently scoped one commit instead of the
// whole feature. On-disk git fixtures only (real init/commit/branch).

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveImplementDiffBase } from '../../govern/payload-diff-scope.js';

function git(repo: string, ...args: string[]): string {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  return typeof r.stdout === 'string' ? r.stdout.trim() : '';
}
function commitAll(repo: string, message: string): void {
  spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' });
  spawnSync(
    'git',
    ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-gpg-sign', '-m', message],
    { encoding: 'utf8' },
  );
}
/** A repo on default branch `main` with one seed commit. */
function setupMain(): string {
  const repo = mkdtempSync(join(tmpdir(), 'diff-base-'));
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'README.md'), 'seed\n');
  commitAll(repo, 'chore: seed');
  return repo;
}

describe('030 — resolveImplementDiffBase (whole-feature default)', () => {
  it('returns the explicit base verbatim when one is given', () => {
    const repo = setupMain();
    try {
      expect(resolveImplementDiffBase(repo, 'abc123')).toBe('abc123');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('defaults to the merge-base with the default branch (the feature fork point), NOT HEAD~1', () => {
    const repo = setupMain();
    const forkPoint = git(repo, 'rev-parse', 'HEAD');
    // branch off main and add TWO commits — HEAD~1 would miss the first one.
    git(repo, 'checkout', '-q', '-b', 'feature/x');
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src/a.ts'), 'export const a = 1;\n');
    commitAll(repo, 'feat: a');
    writeFileSync(join(repo, 'src/b.ts'), 'export const b = 2;\n');
    commitAll(repo, 'feat: b');
    try {
      const base = resolveImplementDiffBase(repo, undefined);
      expect(base).toBe(forkPoint); // the merge-base, not HEAD~1
      expect(base).not.toBe('HEAD~1');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('resolves the fork point via origin/main when it is the only default-branch ref (TASK-435)', () => {
    // A worktree/fresh-clone shape: no local `main`/`master`, and `refs/remotes/origin/HEAD`
    // is unset — the ONLY ref to the default branch is the remote-tracking `origin/main`.
    // The buggy resolver returns HEAD~1 (scoping one commit); it must instead find the
    // merge-base with origin/main (the whole feature span).
    const repo = mkdtempSync(join(tmpdir(), 'diff-base-origin-'));
    git(repo, 'init', '-q', '-b', 'feature/x');
    writeFileSync(join(repo, 'README.md'), 'seed\n');
    commitAll(repo, 'chore: seed');
    const forkPoint = git(repo, 'rev-parse', 'HEAD');
    // Point a remote-tracking ref at the fork point; do NOT create a local main or origin/HEAD.
    git(repo, 'update-ref', 'refs/remotes/origin/main', forkPoint);
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src/a.ts'), 'export const a = 1;\n');
    commitAll(repo, 'feat: a');
    writeFileSync(join(repo, 'src/b.ts'), 'export const b = 2;\n');
    commitAll(repo, 'feat: b');
    try {
      const base = resolveImplementDiffBase(repo, undefined);
      expect(base).toBe(forkPoint); // the merge-base via origin/main, not HEAD~1
      expect(base).not.toBe('HEAD~1');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('falls back to HEAD~1 on the default branch itself (no feature fork point)', () => {
    const repo = setupMain();
    writeFileSync(join(repo, 'src.ts'), 'x\n');
    commitAll(repo, 'chore: second on main');
    try {
      // On `main` the merge-base with `main` is HEAD, so there is no feature span;
      // the documented fallback is HEAD~1.
      expect(resolveImplementDiffBase(repo, undefined)).toBe('HEAD~1');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
