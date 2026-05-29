import { execSync, execFileSync } from 'node:child_process';
import { basename } from 'node:path';

export function repoRoot(cwd: string = process.cwd()): string {
  try {
    return execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Not inside a git repository.');
  }
}

/**
 * Path of the main worktree (NOT the current worktree). When the helper
 * is invoked from inside a feature worktree, `repoRoot()` returns that
 * worktree's path — using its basename for `<repo>` substitution causes
 * the doubled-name regression in #196 (`<repo>-<slug>-<slug>`). Resolve
 * via `git worktree list --porcelain`, whose first record is the main
 * worktree.
 */
export function mainWorktreePath(cwd: string = process.cwd()): string {
  const out = execFileSync('git', ['-C', cwd, 'worktree', 'list', '--porcelain'], {
    encoding: 'utf8',
  });
  const match = /^worktree (.+)$/m.exec(out);
  if (!match || !match[1]) {
    throw new Error('Could not determine main worktree path from `git worktree list`.');
  }
  return match[1].trim();
}

export function repoBasename(cwd: string = process.cwd()): string {
  return basename(mainWorktreePath(cwd));
}

export function currentBranch(cwd: string = process.cwd()): string {
  return execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim();
}

export function expandWorktreeName(template: string, slug: string, cwd: string = process.cwd()): string {
  return template.replace('<repo>', repoBasename(cwd)).replace('<slug>', slug);
}

/**
 * If a worktree is already checked out for `branchName`, return its
 * path. Returns null otherwise. Used by setup to detect the
 * already-pre-created-worktree case and reuse it instead of failing
 * with "Branch already exists" (#209) or creating a duplicate (#196).
 */
export function findWorktreeForBranch(cwd: string, branchName: string): string | null {
  const out = execFileSync('git', ['-C', cwd, 'worktree', 'list', '--porcelain'], {
    encoding: 'utf8',
  });
  const blocks = out.split(/\n\n+/);
  for (const block of blocks) {
    const wt = /^worktree (.+)$/m.exec(block);
    const br = /^branch refs\/heads\/(.+)$/m.exec(block);
    if (wt && br && wt[1] && br[1] === branchName) {
      return wt[1].trim();
    }
  }
  return null;
}
