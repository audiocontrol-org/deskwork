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
 * AUDIT-20260602-39 + AUDIT-20260603-03 (maxBuffer-swallow): each DI
 * callback now returns a discriminated `DiffCallResult` instead of a
 * raw string, so an `execFileSync` `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`
 * surfaces as a distinct `'too-large'` source value rather than being
 * silently collapsed into `'empty'`. The operator then sees a cure
 * naming the buffer overflow, not the misleading "no novel work" cure.
 *
 * Pure function over the dependency-injection bag — no fs, no child_process.
 */

export type AuditedDiffSource =
  | 'commit-range'
  | 'staged'
  | 'unstaged'
  | 'empty'
  | 'too-large';

export interface AuditedDiff {
  /**
   * The diff payload to feed the audit-barrage prompt.
   *  - `'commit-range'` / `'staged'` / `'unstaged'`: the captured diff.
   *  - `'empty'`: `''`.
   *  - `'too-large'`: `''` (the underlying source overflowed maxBuffer
   *    — feeding a truncated diff to the barrage is worse than refusing).
   */
  readonly diff: string;
  /** Which fallback layer produced the diff (or named the failure). */
  readonly source: AuditedDiffSource;
  /**
   * When `source === 'too-large'`, which underlying layer overflowed.
   * Lets the caller name the specific git invocation in the cure.
   */
  readonly tooLargeLayer?: 'commit-range' | 'staged' | 'unstaged';
}

/**
 * Discriminated result the DI callbacks return. `ok: true` carries the
 * captured diff string; `ok: false` distinguishes a maxBuffer overflow
 * from a generic git error.
 *
 * Per AUDIT-20260602-39 / AUDIT-20260603-03 — the pre-fix callbacks
 * returned a raw `string` and collapsed every error (including
 * maxBuffer overflow) into `''`. That produced a backwards "no novel
 * work" cure when the real cause was "diff exceeded the 50MB stdio cap."
 */
export type DiffCallResult =
  | { readonly ok: true; readonly diff: string }
  | { readonly ok: false; readonly kind: 'too-large' };

export interface ComputeAuditedDiffDeps {
  /** Runs `git diff <range>` for a `tip..HEAD` (or similar) revision range. */
  readonly gitDiffRange: (range: string) => DiffCallResult;
  /** Runs `git diff --cached` to capture staged-but-uncommitted changes. */
  readonly gitDiffCached: () => DiffCallResult;
  /** Runs `git diff` (worktree vs index) to capture unstaged changes. */
  readonly gitDiffWorktree: () => DiffCallResult;
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
 *
 * Per AUDIT-20260603-03 — when ANY layer signals `ok: false; kind: 'too-large'`,
 * short-circuit immediately and emit `source: 'too-large'`. Refusing
 * on overflow is correct (a truncated diff fed to the barrage would
 * silently elicit fabricated findings just like a blank diff would).
 * The caller distinguishes 'too-large' from 'empty' via the source
 * value and surfaces the right cure.
 */
export function computeAuditedDiff(args: ComputeAuditedDiffArgs): AuditedDiff {
  const { range, deps } = args;

  const rangeResult = deps.gitDiffRange(range);
  if (!rangeResult.ok) {
    return { diff: '', source: 'too-large', tooLargeLayer: 'commit-range' };
  }
  if (rangeResult.diff.trim().length > 0) {
    return { diff: rangeResult.diff, source: 'commit-range' };
  }

  const stagedResult = deps.gitDiffCached();
  if (!stagedResult.ok) {
    return { diff: '', source: 'too-large', tooLargeLayer: 'staged' };
  }
  if (stagedResult.diff.trim().length > 0) {
    return { diff: stagedResult.diff, source: 'staged' };
  }

  const worktreeResult = deps.gitDiffWorktree();
  if (!worktreeResult.ok) {
    return { diff: '', source: 'too-large', tooLargeLayer: 'unstaged' };
  }
  if (worktreeResult.diff.trim().length > 0) {
    return { diff: worktreeResult.diff, source: 'unstaged' };
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

/**
 * Cure message for the `'too-large'` source.
 *
 * Per AUDIT-20260603-03: the pre-fix code silently swallowed
 * `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` into `''` and the operator then
 * saw the EMPTY_DIFF_CURE_MESSAGE, which is actively wrong — there IS
 * novel work, it just overflowed the 50 MB stdio cap. This message
 * names the actual cause + an actionable response.
 *
 * `{LAYER}` is replaced by the caller with the specific layer that
 * overflowed (`commit-range` / `staged` / `unstaged`).
 */
export const TOO_LARGE_DIFF_CURE_MESSAGE_TEMPLATE = [
  'implement-hook: refused — the {LAYER} diff exceeded the 50 MB stdio',
  'maxBuffer cap (ERR_CHILD_PROCESS_STDIO_MAXBUFFER). The diff is real;',
  'feeding a truncated copy to the audit-barrage would silently elicit',
  'fabricated findings just like a blank diff would.',
  '',
  'Cure options:',
  '  - Reduce the audited range: commit smaller batches so the per-task',
  '    diff fits, then re-run implement-hook between commits.',
  '  - Skip a large vendored / generated file from the audit via a',
  '    `.gitattributes` `diff` driver (audit-barrage reads from git diff).',
  '  - File an issue to raise the maxBuffer cap if the legitimate diff',
  '    truly exceeds 50 MB. The cap is at',
  '    `plugins/dw-lifecycle/src/subcommands/implement-hook.ts`',
  '    (gitDiff / gitDiffCached / gitDiffWorktree helpers).',
  '',
  'This refusal is correct (per AUDIT-20260603-03): a maxBuffer overflow',
  'was previously caught { return ""; }, producing the misleading "no',
  'novel work" cure. The audit-barrage protects against confabulation;',
  'the maxBuffer classification protects against it too.',
].join('\n');

/**
 * Build the `'too-large'` cure message with the specific overflowing
 * layer substituted in. Pure function so the caller can use it without
 * importing string-manipulation utilities.
 */
export function buildTooLargeCure(layer: 'commit-range' | 'staged' | 'unstaged'): string {
  return TOO_LARGE_DIFF_CURE_MESSAGE_TEMPLATE.replace(/\{LAYER\}/g, layer);
}
