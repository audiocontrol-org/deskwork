// Pre-flight gates for /dw-lifecycle:archive-branch.
//
// The skill is all-or-nothing: any failed pre-flight check throws before
// any mutation. Each check has a single observable failure shape with an
// operator-actionable message. Tests exercise each gate independently.

import type { RunGit } from '../debt-report/types.js';

export class ArchiveBranchPreflightError extends Error {
  readonly kind:
    | 'unknown-branch'
    | 'branch-checked-out'
    | 'tag-exists'
    | 'no-novel-commits';

  constructor(
    kind: ArchiveBranchPreflightError['kind'],
    message: string,
  ) {
    super(message);
    this.kind = kind;
    this.name = 'ArchiveBranchPreflightError';
  }
}

interface CheckArgs {
  readonly branch: string;
  readonly tagName: string;
  readonly force: boolean;
  readonly runGit: RunGit;
}

/**
 * Slash-to-dash replacement: git refs use slashes as namespace separators;
 * the `archived/` tag prefix plus a slash-containing branch name would
 * produce a confusing nested-looking tag (`archived/feature/foo-DATE`).
 * Replace all slashes in the branch name with dashes so the tag namespace
 * stays flat: `archived/feature-foo-DATE`.
 */
export function buildTagName(branch: string, now: Date): string {
  const dateStr = formatDate(now);
  const flatBranch = branch.replace(/\//g, '-');
  return `archived/${flatBranch}-${dateStr}`;
}

function formatDate(now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Run all pre-flight gates in order. The first failure throws; no
 * subsequent gates run. Returns metadata extracted during the gates
 * (last commit sha + subject) so the apply step doesn't re-shell out.
 */
export function runPreflight(args: CheckArgs): {
  readonly lastCommitSha: string;
  readonly lastCommitSubject: string;
} {
  const { branch, tagName, force, runGit } = args;
  assertBranchExists(branch, runGit);
  assertBranchNotCheckedOut(branch, runGit);
  assertTagDoesNotExist(tagName, runGit);
  const meta = readBranchTip(branch, runGit);
  if (!force) {
    assertHasNovelCommits(branch, runGit);
  }
  return meta;
}

function assertBranchExists(branch: string, runGit: RunGit): void {
  try {
    runGit(['rev-parse', '--verify', `refs/heads/${branch}`]);
  } catch {
    throw new ArchiveBranchPreflightError(
      'unknown-branch',
      `Unknown branch: ${branch}. Use git branch --list to see available branches.`,
    );
  }
}

function assertBranchNotCheckedOut(branch: string, runGit: RunGit): void {
  const out = runGit(['worktree', 'list', '--porcelain']);
  const blocks = out.split(/\n\n+/);
  for (const block of blocks) {
    const wtMatch = /^worktree (.+)$/m.exec(block);
    const brMatch = /^branch refs\/heads\/(.+)$/m.exec(block);
    if (wtMatch && brMatch && brMatch[1] === branch && wtMatch[1]) {
      const path = wtMatch[1].trim();
      throw new ArchiveBranchPreflightError(
        'branch-checked-out',
        `Branch ${branch} is checked out at ${path}. Remove the worktree first: git worktree remove ${path}.`,
      );
    }
  }
}

function assertTagDoesNotExist(tagName: string, runGit: RunGit): void {
  let exists = false;
  try {
    runGit(['rev-parse', '--verify', `refs/tags/${tagName}`]);
    exists = true;
  } catch {
    // Tag absence is the desired state; rev-parse exits non-zero when the
    // ref doesn't exist. Swallow.
  }
  if (exists) {
    throw new ArchiveBranchPreflightError(
      'tag-exists',
      `Tag ${tagName} already exists. Either delete the existing tag (git tag -d ${tagName}) or use a different date.`,
    );
  }
}

function assertHasNovelCommits(branch: string, runGit: RunGit): void {
  let countStr: string;
  try {
    countStr = runGit([
      'rev-list',
      '--count',
      branch,
      '^origin/main',
    ]).trim();
  } catch {
    // `origin/main` may not exist in fixture repos or fresh clones; treat
    // as "cannot verify novelty" — let the operator decide via --force.
    throw new ArchiveBranchPreflightError(
      'no-novel-commits',
      `Could not compare ${branch} against origin/main. If the remote is unavailable, pass --force to archive anyway.`,
    );
  }
  const count = Number.parseInt(countStr, 10);
  if (!Number.isFinite(count) || count <= 0) {
    throw new ArchiveBranchPreflightError(
      'no-novel-commits',
      `Branch ${branch} has no commits not on origin/main. Archiving anyway? Pass --force to confirm.`,
    );
  }
}

function readBranchTip(
  branch: string,
  runGit: RunGit,
): { readonly lastCommitSha: string; readonly lastCommitSubject: string } {
  const sha = runGit(['rev-parse', branch]).trim();
  const subject = runGit(['log', '-1', '--format=%s', branch]).trim();
  return { lastCommitSha: sha, lastCommitSubject: subject };
}
