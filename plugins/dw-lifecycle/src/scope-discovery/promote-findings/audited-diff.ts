/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/audited-diff.ts
 *
 * Phase 22 Task 2 (#399 Friction 2) — pure helper that picks the right
 * diff to feed the audit-barrage prompt.
 *
 * The pre-fix implement-hook used `git diff <lastBarrageTip..HEAD>`
 * unconditionally. When HEAD has no novel commits over the marker tip
 * (the immediate post-`git reset --hard origin/main` state, with the
 * operator's new work sitting staged-uncommitted in the index), the
 * commit-range diff is empty AND the staged + unstaged changes aren't
 * included. The audit fires against a blank "Diff under audit" section
 * and any sibling CLI model emitting code-level findings against the
 * blank diff is fabricating (captured live as AUDIT-20260602-01 on
 * feature/deskwork-plugin).
 *
 * Fix: fall back through commit-range → staged → unstaged, and refuse
 * with a loud cure when all three sources are empty. The caller (the
 * `implement-hook` CLI verb) exits non-zero on the `empty` source so
 * the operator sees the cure message rather than firing the barrage
 * on blank input.
 *
 * Pure function over the dependency-injection bag — no fs, no child_process.
 */

export type AuditedDiffSource = 'commit-range' | 'staged' | 'unstaged' | 'empty';

export interface AuditedDiff {
  /** The diff payload to feed the audit-barrage prompt. `''` when source === 'empty'. */
  readonly diff: string;
  /** Which fallback layer produced the diff. `empty` means all three were empty. */
  readonly source: AuditedDiffSource;
}

export interface ComputeAuditedDiffDeps {
  /** Runs `git diff <range>` for a `tip..HEAD` (or similar) revision range. */
  readonly gitDiffRange: (range: string) => string;
  /** Runs `git diff --cached` to capture staged-but-uncommitted changes. */
  readonly gitDiffCached: () => string;
  /** Runs `git diff` (worktree vs index) to capture unstaged changes. */
  readonly gitDiffWorktree: () => string;
}

export interface ComputeAuditedDiffArgs {
  /** Revision range — typically `lastBarrageTip..HEAD` or `HEAD~10..HEAD`. */
  readonly range: string;
  readonly deps: ComputeAuditedDiffDeps;
}

/**
 * Walk the fallback chain: commit-range → staged → unstaged → empty.
 *
 * Each layer is consulted only when the prior layer's output is empty.
 * The first non-empty payload wins; its source is recorded so the
 * caller can surface a clarifying message (or refuse on `empty`).
 *
 * Whitespace-only diffs count as empty — git can emit a header-only
 * diff in some edge cases, and we want the fallback to fire there too.
 */
export function computeAuditedDiff(args: ComputeAuditedDiffArgs): AuditedDiff {
  const { range, deps } = args;
  const rangeDiff = deps.gitDiffRange(range);
  if (rangeDiff.trim().length > 0) {
    return { diff: rangeDiff, source: 'commit-range' };
  }
  const stagedDiff = deps.gitDiffCached();
  if (stagedDiff.trim().length > 0) {
    return { diff: stagedDiff, source: 'staged' };
  }
  const worktreeDiff = deps.gitDiffWorktree();
  if (worktreeDiff.trim().length > 0) {
    return { diff: worktreeDiff, source: 'unstaged' };
  }
  return { diff: '', source: 'empty' };
}

/**
 * Operator-facing cure message for the `empty` source. The caller writes
 * this to stderr before exiting non-zero so the operator sees a
 * specific, actionable diagnosis rather than a silent barrage of
 * fabricated findings.
 */
export const EMPTY_DIFF_CURE_MESSAGE = [
  'implement-hook: no novel work to audit.',
  '  - The commit range (<lastBarrageTip>..HEAD) is empty.',
  '  - Nothing is staged (`git diff --cached`).',
  '  - Nothing is in the working tree (`git diff`).',
  '',
  'Cure: stage the change you intended to audit (`git add <files>`),',
  'OR commit the change first so it appears in the commit range,',
  'OR confirm that you did not mean to run implement-hook on a clean tree.',
  '',
  'Refusing to fire the barrage on a blank diff (per #399 Friction 2):',
  'any sibling model that emits code-level findings against a blank',
  '"Diff under audit" section is fabricating — the refusal protects the',
  'audit-log from confabulated findings.',
].join('\n');
