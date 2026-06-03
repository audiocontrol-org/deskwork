/**
 * plugins/dw-lifecycle/src/scope-discovery/util/git-ancestry.ts
 *
 * Shared ancestry helper used by `check-implement-hook-ran` and
 * `implement-hook` to decide whether a marker tip lives on the same
 * history line as HEAD.
 *
 * The function returns a tri-state result. Each caller chooses its own
 * disposition for the `unknown` case — they are NOT symmetric.
 *
 *   - `'ancestor'`     — tip IS an ancestor of HEAD (same-history-line).
 *   - `'not-ancestor'` — tip is NOT an ancestor of HEAD. Returned only
 *                       when git is healthy AND confirms the negative.
 *   - `'unknown'`      — git error: tip ref missing, no .git/, spawn
 *                       failure, non-git working directory. Caller
 *                       decides what this means in its context.
 *
 * **Why tri-state (AUDIT-20260602-45 fix).** Before this rewrite, the
 * helper returned a boolean with a hardcoded `catch → true` fallback
 * that was fail-CLOSED for the commit gate (`true` → refuse) but
 * fail-OPEN for `implement-hook` (`true` → trust the diverged tip and
 * walk it as a barrage range). A single fixed error policy cannot be
 * safe for both callers because their safe directions are inverted.
 * Returning `'unknown'` forces each caller to make the safety choice
 * explicit at the call site, where the consequence is visible.
 *
 * The pre-Phase-22 helpers (with `catch { return false; }`) had this
 * shape implicitly because the return value was never compared against
 * anything but `marker.tip === head`. The diverged-history branch
 * landed in Phase 22 Task 3 made the boolean ambiguous; the tri-state
 * resolves the ambiguity at the type level.
 *
 * Per-caller disposition (documented for the two known consumers):
 *
 *   - `check-implement-hook-ran`: `unknown` → fall through to
 *     `refuse-marker-stale`. The commit gate is security-relevant; the
 *     safe default on unknown state is to refuse.
 *
 *   - `implement-hook` (barrage baseline): `unknown` → fall back to
 *     the `HEAD~10..HEAD` baseline. The dangerous outcome would be to
 *     trust a diverged tip and walk main's shipped commits as "new
 *     diff"; the safe default on unknown is to drop the marker tip and
 *     re-baseline.
 */

import { execFileSync } from 'node:child_process';

export type AncestryResult = 'ancestor' | 'not-ancestor' | 'unknown';

export interface IsAncestorOfHeadOptions {
  readonly repoRoot: string;
  readonly tip: string;
}

/**
 * Run `git merge-base --is-ancestor <tip> HEAD` in `repoRoot` and map
 * the result to the `AncestryResult` tri-state.
 *
 * Pure-ish: takes options, runs git, returns the discriminator. No
 * side effects on disk.
 */
// Per AUDIT-20260602-47: the tri-state refactor's whole point is that
// each caller picks its own `unknown` disposition at the call site.
// The two collapse arrows are therefore safety-critical — bugs there
// would be invisible to a helper-isolation test like the rest of this
// file. Below are the two named collapses + the assertion that each
// caller imports the named one rather than re-deriving an inline
// expression. The dedicated test file exercises both across all three
// tri-state inputs.

/**
 * Collapse arrow for the **commit-msg gate** (`check-implement-hook-ran`).
 *
 * The gate's library treats `true` as "on same history line → refuse-
 * marker-stale" and `false` as "diverged → allow boot case." The safe
 * direction on `'unknown'` is to refuse the commit; therefore map
 * `'ancestor'` and `'unknown'` to `true`, `'not-ancestor'` to `false`.
 */
export function ancestryAsGateBoolean(result: AncestryResult): boolean {
  return result !== 'not-ancestor';
}

/**
 * Collapse arrow for **implement-hook**'s barrage-baseline computation.
 *
 * implement-hook treats a non-null tip as "use this commit as the
 * audited-diff baseline" and a null tip as "fall back to `HEAD~10..HEAD`."
 * The dangerous outcome would be to walk an unverified tip as the
 * baseline (Friction-1's exact pathology), so the safe direction on
 * `'unknown'` is to drop the marker tip and re-baseline.
 *
 * Only `'ancestor'` is trustworthy. `'not-ancestor'` and `'unknown'`
 * both collapse to `null` (fall back).
 */
export function ancestryAsBarrageTip(
  result: AncestryResult,
  rawTip: string | null,
): string | null {
  return result === 'ancestor' ? rawTip : null;
}

export function checkAncestry(opts: IsAncestorOfHeadOptions): AncestryResult {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', opts.tip, 'HEAD'], {
      cwd: opts.repoRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return 'ancestor'; // exit 0
  } catch (err) {
    const status = (err as { status?: number | null }).status;
    if (status === 1) return 'not-ancestor';
    // exit > 1 OR no `status` at all (spawn failure, ENOENT, non-git
    // directory). Cannot determine ancestry — let the caller decide.
    return 'unknown';
  }
}

// Per AUDIT-20260602-39: the audited-diff fallback (`HEAD~10..HEAD`)
// blows up on feature branches that recently merged origin/main. The
// merge commit + 9 main-side commits sit between HEAD and HEAD~10, so
// the diff balloons (945k insertions in the live repro) and overflows
// `execFileSync`'s maxBuffer cap — `gitDiff` silently swallows it and
// returns `''`. The audited-diff helper then falls through to "empty"
// and refuses to fire, even though the operator's feature work IS the
// last few commits.
//
// Fix: pick the closer-to-HEAD of `merge-base HEAD origin/main` and
// `HEAD~10`. The merge-base lands at the point this branch diverged
// from main; HEAD~10 caps how far back we go on a long-lived branch
// without a recent main-merge. Whichever is more recent (i.e., an
// ancestor of the other when both are ancestors of HEAD) wins.

export interface PickFallbackBaselineDeps {
  /** Returns the merge-base SHA of HEAD with the named ref, or `null` if unknowable. */
  readonly resolveMergeBase: (ref: string) => string | null;
  /** Returns the SHA at HEAD~`n`, or `null` if the offset doesn't exist (shallow repo, fresh history). */
  readonly resolveRelativeHead: (n: number) => string | null;
  /**
   * Returns true iff `tip` is an ancestor of `descendant`. Used to
   * decide which of two candidate baselines is closer to HEAD.
   */
  readonly isAncestorOf: (tip: string, descendant: string) => boolean;
}

export interface PickFallbackBaselineOptions {
  /** The upstream ref to compare against. Default: `'origin/main'`. */
  readonly upstreamRef?: string;
  /** Maximum lookback depth on the local branch. Default: 10. */
  readonly maxLookback?: number;
}

/**
 * Pick the closer-to-HEAD baseline for the audited-diff fallback.
 *
 * Algorithm:
 *   1. Resolve `merge-base HEAD origin/main` and `HEAD~maxLookback`.
 *   2. If both resolve, return whichever is an ancestor of the other
 *      (the descendant is closer to HEAD). If neither is an ancestor
 *      of the other, prefer the merge-base (the semantically-meaningful
 *      branch-point).
 *   3. If only one resolves, return it.
 *   4. If neither resolves, return `null` (caller falls back to a
 *      string like `'HEAD~10'` — git will error or produce empty, and
 *      the audited-diff helper will refuse via the unknown-state path).
 *
 * Pure function over the DI bag.
 */
// Phase 23 Task 1: enumerate every commit SHA reachable in a git
// revision range (e.g., `lastBarrageTip..HEAD`). Used by `implement-hook`
// to append a per-SHA log entry for every commit its barrage walked,
// rather than recording only the tip-at-run-time and leaving earlier
// commits uncovered by the pre-push gate.
//
// Pure-ish: takes options, runs git, returns the SHA list. Returns
// empty on git error (the caller decides what to do — typically falls
// back to logging just the HEAD entry).

export interface EnumerateCommitsInRangeOptions {
  readonly repoRoot: string;
  /** Revision range, e.g., `'aaa..bbb'` or `'HEAD~3..HEAD'`. */
  readonly range: string;
}

/**
 * Run `git rev-list <range>` and return the SHAs (in newest-first
 * order — `git rev-list`'s default). Empty array on any git error
 * (bad range, not-a-repo, spawn failure).
 *
 * Used by the per-SHA log-write path. The caller iterates the result
 * and writes one log entry per SHA, all sharing disposition + timestamp
 * + runDir.
 */
export function enumerateCommitsInRange(
  opts: EnumerateCommitsInRangeOptions,
): readonly string[] {
  try {
    const out = execFileSync('git', ['rev-list', opts.range], {
      cwd: opts.repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

export function pickFallbackBaseline(
  deps: PickFallbackBaselineDeps,
  opts: PickFallbackBaselineOptions = {},
): string | null {
  const upstream = opts.upstreamRef ?? 'origin/main';
  const lookback = opts.maxLookback ?? 10;
  const mergeBase = deps.resolveMergeBase(upstream);
  const relHead = deps.resolveRelativeHead(lookback);
  if (mergeBase !== null && relHead !== null) {
    // Both candidates resolved. Pick whichever is closer to HEAD:
    //   - If mergeBase is an ancestor of relHead → relHead is closer.
    //   - If relHead is an ancestor of mergeBase → mergeBase is closer.
    //   - Else: prefer mergeBase (semantically meaningful branch-point;
    //     ties go to the upstream-anchored ref).
    if (deps.isAncestorOf(mergeBase, relHead)) return relHead;
    if (deps.isAncestorOf(relHead, mergeBase)) return mergeBase;
    return mergeBase;
  }
  if (mergeBase !== null) return mergeBase;
  if (relHead !== null) return relHead;
  return null;
}
