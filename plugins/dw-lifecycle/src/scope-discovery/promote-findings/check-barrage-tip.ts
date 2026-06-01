/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-barrage-tip.ts
 *
 * Phase 16 Task 3 — the new-diff guard for the audit-barrage hook.
 *
 * Background (#383): pre-Phase-16, /dw-lifecycle:implement Step 6's gate
 * fused two separate concerns — "should new work be cross-model
 * audited?" (always yes, per the third-audit-surface thesis) and "should
 * nit findings be scoped vs slushed?" (context-dependent, the
 * dampener's actual job). The fused gate skipped the whole hook when
 * the dampener engaged, which meant long autonomous burndowns ran with
 * zero audit coverage on new work.
 *
 * Phase 16 splits the concerns. The dampener still controls disposition
 * (slush vs promote). This new library is the ONLY legitimate skip:
 * skip iff there is no new diff since the most-recent barrage's
 * recorded HEAD (`tip.sha`, written by `audit-barrage` at fire-time per
 * Task 2). Otherwise, fire.
 *
 * Pure-fn shape with injected filesystem + git side-effects so the
 * library is unit-testable without a tmp git repo per test.
 */

export interface BarrageTipCheckArgs {
  /**
   * Absolute path to `.dw-lifecycle/scope-discovery/audit-runs/`.
   * Listed via `listRunDirs` to discover the most-recent run.
   */
  readonly auditRunsDir: string;
  /**
   * Returns the audit-run directory paths under `auditRunsDir`, in any
   * order. The library lexically sorts the result and picks the LAST
   * entry (timestamp-prefixed run-dir names → lexical sort ===
   * chronological sort).
   */
  readonly listRunDirs: (auditRunsDir: string) => Promise<string[]>;
  /**
   * Returns the contents of `<runDir>/tip.sha`, trimmed; or `null` when
   * the file is missing or unreadable. The fail-safe default for
   * missing is fire (`hasNewDiff: true`), not skip — silently skipping
   * audits on historical runs that pre-date Task 2 would re-create the
   * #383 audit-coverage hole.
   */
  readonly readTipSha: (runDir: string) => Promise<string | null>;
  /**
   * Returns the number of commits in the range string (typically
   * `"<tip>..HEAD"`). The library calls this only when a non-null
   * tip.sha is available.
   */
  readonly gitRevListCount: (range: string) => Promise<number>;
  /**
   * Phase 18 Task 6 (per AUDIT-20260601-30 / claude-opus-01, HIGH):
   * the bookkeeping-commit filter. When provided, the library checks
   * the changed files in the diff range; if ALL files match
   * bookkeeping patterns (audit-log.md / workplan.md / .dw-lifecycle/
   * marker files), the barrage is skipped (the diff has no
   * substantive source code worth auditing).
   *
   * Working-code invariant the filter must NOT break: ANY non-
   * bookkeeping file → fire. Mixed diffs ALSO fire (conservative —
   * the source change deserves audit). When this arg is omitted,
   * behavior is unchanged (pre-Phase-18-Task-6 callers continue to
   * fire on any new diff).
   */
  readonly listDiffFiles?: (range: string) => Promise<string[]>;
}

/**
 * Per Phase 18 Task 6 / AUDIT-30: a path is "bookkeeping" iff it's
 * an audit-log, a workplan, a tooling-feedback log, or any file
 * under `.dw-lifecycle/`. Source files (including tests) → not
 * bookkeeping → barrage should fire.
 */
function isBookkeepingPath(relPath: string): boolean {
  if (relPath.startsWith('.dw-lifecycle/')) return true;
  // Per-feature docs files: audit-log.md, workplan.md, tooling-feedback.md.
  if (/(?:^|\/)audit-log\.md$/.test(relPath)) return true;
  if (/(?:^|\/)workplan\.md$/.test(relPath)) return true;
  if (/(?:^|\/)tooling-feedback\.md$/.test(relPath)) return true;
  return false;
}

export interface BarrageTipCheckResult {
  /**
   * True when the audit-barrage SHOULD fire. False is the only legitimate
   * skip: zero new commits since the most-recent barrage's tip.
   */
  readonly hasNewDiff: boolean;
  /** The most-recent run-dir's tip.sha, or null when missing/no prior. */
  readonly lastTipSha: string | null;
  /** `git rev-list --count <tip>..HEAD`; 0 when tip unknown. */
  readonly newCommitCount: number;
  /** Human-readable explanation suitable for stderr / per-task report. */
  readonly reason: string;
}

export async function checkBarrageTip(
  args: BarrageTipCheckArgs,
): Promise<BarrageTipCheckResult> {
  const runDirs = await args.listRunDirs(args.auditRunsDir);
  if (runDirs.length === 0) {
    return {
      hasNewDiff: true,
      lastTipSha: null,
      newCommitCount: 0,
      reason:
        'No prior barrage runs in audit-runs/ — fail-safe to fire the barrage.',
    };
  }
  // Lexical sort = chronological sort (run-dir names are timestamp-
  // prefixed). Most recent = last after sort.
  const sortedRunDirs = [...runDirs].sort();
  const latestRunDir = sortedRunDirs[sortedRunDirs.length - 1]!;
  const tipSha = await args.readTipSha(latestRunDir);
  if (tipSha === null || tipSha.length === 0) {
    return {
      hasNewDiff: true,
      lastTipSha: null,
      newCommitCount: 0,
      reason:
        `Latest run-dir (${latestRunDir}) has no tip.sha — fail-safe to fire ` +
        `(historical run pre-dating Phase 16 Task 2, or write failed).`,
    };
  }
  const newCommitCount = await args.gitRevListCount(`${tipSha}..HEAD`);
  if (newCommitCount === 0) {
    return {
      hasNewDiff: false,
      lastTipSha: tipSha,
      newCommitCount: 0,
      reason:
        `No new diff since last barrage (tip ${tipSha.slice(0, 8)}); ` +
        `nothing to audit. Skip the hook.`,
    };
  }
  // Phase 18 Task 6 / AUDIT-30: bookkeeping-only diff filter. When the
  // caller supplies `listDiffFiles`, check whether ALL changed files
  // match bookkeeping patterns. If so, skip the barrage — auditing
  // workplan/audit-log/.dw-lifecycle changes produces self-referential
  // meta-findings (the "recursive fix-trap" claude-opus-01 named).
  if (args.listDiffFiles !== undefined) {
    const files = await args.listDiffFiles(`${tipSha}..HEAD`);
    if (files.length > 0 && files.every(isBookkeepingPath)) {
      return {
        hasNewDiff: false,
        lastTipSha: tipSha,
        newCommitCount,
        reason:
          `${newCommitCount} new commit${newCommitCount === 1 ? '' : 's'} since ` +
          `last barrage (tip ${tipSha.slice(0, 8)}), but ALL changed files are ` +
          `bookkeeping (audit-log/workplan/.dw-lifecycle/). Skip the hook to ` +
          `avoid self-referential meta-findings.`,
      };
    }
  }
  return {
    hasNewDiff: true,
    lastTipSha: tipSha,
    newCommitCount,
    reason:
      `${newCommitCount} new commit${newCommitCount === 1 ? '' : 's'} since ` +
      `last barrage (tip ${tipSha.slice(0, 8)}); fire the barrage.`,
  };
}
