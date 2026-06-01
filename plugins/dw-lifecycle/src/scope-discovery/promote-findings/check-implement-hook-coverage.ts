/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-coverage.ts
 *
 * Phase 17 Task 5 — pre-push gate (Layer 3 of the three-layer mech).
 *
 * Walks every commit in `<remote-tip>..HEAD` and verifies the
 * hook-run-log.jsonl contains an entry whose `tip` matches that
 * commit's parent. Catches `--no-verify` bypasses of the commit-msg
 * gate.
 *
 * Discriminated-union result:
 *   - `allow-not-opted-in` — project hasn't enrolled in scope-discovery.
 *   - `allow-no-unpushed-commits` — nothing to push beyond remote-tip.
 *   - `allow-all-commits-backed` — every unpushed commit has a log entry.
 *   - `refuse-uncovered-commits` — one or more unpushed commits have no
 *     matching hook-run entry. Cure: re-run implement-hook for each.
 *
 * Pure-fn with injected log reader + git log resolver so it's unit-
 * testable without a real git repo + log file per test.
 */

import type { HookRunLogEntry } from './hook-run-log.js';

export interface UnpushedCommit {
  readonly sha: string;
  readonly parentSha: string;
  readonly subject: string;
}

export interface CheckImplementHookCoverageArgs {
  /** Resolves git log range `<remote-tip>..HEAD` to a list of commits. */
  readonly resolveUnpushedCommits: () => Promise<UnpushedCommit[]>;
  /** Reads the hook-run-log.jsonl entries. */
  readonly readLog: () => Promise<HookRunLogEntry[]>;
  /** Returns true when the project opted into scope-discovery. */
  readonly isScopeDiscoveryOptedIn: () => Promise<boolean>;
  /**
   * Per AUDIT-20260601-06 (cross-model claude+codex, BLOCKING): the
   * boot-case must NOT trigger on log emptiness alone. The pre-push
   * gate exists specifically to catch --no-verify commits; on a
   * fresh project those would sail through if log-empty == allow.
   * Worse, the failure mode is re-triggerable: deleting the log file
   * (errant git clean, .dw-lifecycle reset) silently reverts the gate
   * to a no-op.
   *
   * Fix: a one-time bootstrap sentinel file. Written by the FIRST
   * successful implement-hook run; persists thereafter. The gate
   * checks for the sentinel's presence (not log emptiness). A
   * deleted log can be recovered; a deleted sentinel cannot
   * re-trigger fail-open because the gate sees "sentinel present
   * but log empty" → refuse (the log was corrupted; not a boot).
   */
  readonly hasBootstrapSentinel: () => Promise<boolean>;
}

export interface UncoveredCommit {
  readonly sha: string;
  readonly parentSha: string;
  readonly subject: string;
}

export type CheckImplementHookCoverageResult =
  | { readonly kind: 'allow-not-opted-in'; readonly reason: string }
  | { readonly kind: 'allow-no-unpushed-commits'; readonly reason: string }
  | { readonly kind: 'allow-no-prior-run'; readonly reason: string }
  | { readonly kind: 'allow-all-commits-backed'; readonly checkedCount: number; readonly reason: string }
  | {
      readonly kind: 'refuse-uncovered-commits';
      readonly uncovered: ReadonlyArray<UncoveredCommit>;
      readonly cure: string;
    };

const CURE_VERB = 'dw-lifecycle implement-hook --feature <slug>';

export async function checkImplementHookCoverage(
  args: CheckImplementHookCoverageArgs,
): Promise<CheckImplementHookCoverageResult> {
  const optedIn = await args.isScopeDiscoveryOptedIn();
  if (!optedIn) {
    return {
      kind: 'allow-not-opted-in',
      reason:
        'Project has not opted into scope-discovery (.dw-lifecycle/scope-discovery/ absent); pre-push gate is moot.',
    };
  }
  const unpushed = await args.resolveUnpushedCommits();
  if (unpushed.length === 0) {
    return {
      kind: 'allow-no-unpushed-commits',
      reason: 'No unpushed commits; nothing to gate.',
    };
  }
  const log = await args.readLog();
  // Boot case — per AUDIT-20260601-06 (BLOCKING, claude-01 + codex-01),
  // the trigger MUST be a persistent bootstrap sentinel, NOT log
  // emptiness. The sentinel is written by the FIRST successful
  // implement-hook run; absent = boot case (allow). Once present,
  // an empty log means the log was corrupted/deleted (refuse — a
  // --no-verify push must not pass via log truncation).
  const hasSentinel = await args.hasBootstrapSentinel();
  if (!hasSentinel) {
    return {
      kind: 'allow-no-prior-run',
      reason:
        `Bootstrap sentinel absent — no implement-hook has ever run on this project. ` +
        `Allowing push to bootstrap; discipline engages after the first hook run.`,
    };
  }
  // Sentinel present but log empty: the log was deleted or corrupted
  // post-bootstrap. Refuse rather than fail-open.
  if (log.length === 0) {
    return {
      kind: 'refuse-uncovered-commits',
      uncovered: unpushed.map((c) => ({
        sha: c.sha,
        parentSha: c.parentSha,
        subject: c.subject,
      })),
      cure:
        `Bootstrap sentinel present but hook-run-log is empty (log was deleted ` +
        `or corrupted post-bootstrap). For each unpushed commit, check out the ` +
        `commit and run \`${CURE_VERB}\` to backfill the log entry, OR ` +
        `restore the log from version control / backup.`,
    };
  }
  // Index log entries by `tip` for O(1) per-commit lookup.
  const tipsSeen = new Set<string>();
  for (const entry of log) {
    tipsSeen.add(entry.tip);
  }
  const uncovered: UncoveredCommit[] = [];
  for (const commit of unpushed) {
    // A commit is covered iff its OWN sha appears in the log (i.e.,
    // implement-hook ran AFTER the commit landed → marker.tip ===
    // commit.sha → that hook audited the diff that produced this
    // commit). Per AUDIT-20260531-16: pre-fix, the gate checked
    // `parentSha`, which was the inverted direction — it asserted
    // "hook ran before this commit," not "hook covered this commit."
    // The hook explicitly runs AFTER each task-completion commit so
    // it can audit the diff that just landed; the log entry's tip
    // is the SHA the hook audited up to.
    if (!tipsSeen.has(commit.sha)) {
      uncovered.push({
        sha: commit.sha,
        parentSha: commit.parentSha,
        subject: commit.subject,
      });
    }
  }
  if (uncovered.length === 0) {
    return {
      kind: 'allow-all-commits-backed',
      checkedCount: unpushed.length,
      reason: `All ${unpushed.length} unpushed commit(s) have matching hook-run entries.`,
    };
  }
  return {
    kind: 'refuse-uncovered-commits',
    uncovered,
    cure:
      `${uncovered.length} unpushed commit(s) have no hook-run record. ` +
      `For each, check out the parent SHA and run \`${CURE_VERB}\` to backfill. ` +
      `Alternatively, reset HEAD to the latest backed commit, re-implement, and re-run the hook after each commit.`,
  };
}
