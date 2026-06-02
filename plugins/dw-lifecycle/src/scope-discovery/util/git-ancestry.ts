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
