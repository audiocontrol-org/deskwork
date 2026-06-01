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
}

export interface UncoveredCommit {
  readonly sha: string;
  readonly parentSha: string;
  readonly subject: string;
}

export type CheckImplementHookCoverageResult =
  | { readonly kind: 'allow-not-opted-in'; readonly reason: string }
  | { readonly kind: 'allow-no-unpushed-commits'; readonly reason: string }
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
  // Index log entries by `tip` for O(1) per-commit lookup.
  const tipsSeen = new Set<string>();
  for (const entry of log) {
    tipsSeen.add(entry.tip);
  }
  const uncovered: UncoveredCommit[] = [];
  for (const commit of unpushed) {
    // A commit is covered iff its PARENT appears in the log (i.e.,
    // implement-hook ran when HEAD was at the parent → marker.tip
    // matches parent → that hook covered the diff that became this
    // commit).
    if (!tipsSeen.has(commit.parentSha)) {
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
