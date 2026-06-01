/**
 * Phase 17 Task 5 — pre-push gate tests.
 *
 * Catches --no-verify bypasses of the commit-msg gate. Invariants:
 *   - All unpushed commits have log entries → allow.
 *   - One or more unpushed commits lack a log entry → refuse, list them.
 *   - No unpushed commits → allow (trivial).
 *   - Project not opted in → allow.
 */

import { describe, it, expect } from 'vitest';
import { checkImplementHookCoverage } from '../../../scope-discovery/promote-findings/check-implement-hook-coverage.js';
import type { HookRunLogEntry } from '../../../scope-discovery/promote-findings/hook-run-log.js';

function makeArgs(opts: {
  unpushed: Array<{ sha: string; parentSha: string; subject: string }>;
  logTips: string[];
  optedIn?: boolean;
  bootstrapped?: boolean;
}) {
  return {
    resolveUnpushedCommits: async () => opts.unpushed,
    readLog: async () =>
      opts.logTips.map(
        (tip): HookRunLogEntry => ({
          tip,
          timestamp: '2026-05-31T20:00:00.000Z',
          disposition: 'fired-and-promoted',
          runDir: null,
        }),
      ),
    isScopeDiscoveryOptedIn: async () => opts.optedIn ?? true,
    // Default: assume bootstrapped (mature project state). Boot-case
    // tests pass `bootstrapped: false` explicitly.
    hasBootstrapSentinel: async () => opts.bootstrapped ?? true,
  };
}

describe('checkImplementHookCoverage — Phase 17 Task 5 (pre-push gate)', () => {
  it('allows when project is not opted into scope-discovery', async () => {
    const result = await checkImplementHookCoverage(
      makeArgs({
        unpushed: [{ sha: 'a', parentSha: 'b', subject: 'whatever' }],
        logTips: [],
        optedIn: false,
      }),
    );
    expect(result.kind).toBe('allow-not-opted-in');
  });

  it('allows when there are no unpushed commits', async () => {
    const result = await checkImplementHookCoverage(
      makeArgs({ unpushed: [], logTips: ['abc'] }),
    );
    expect(result.kind).toBe('allow-no-unpushed-commits');
  });

  it('allows when every unpushed commit has its OWN sha in the log (hook ran after each)', async () => {
    // Per AUDIT-20260531-16: the hook runs AFTER each commit lands.
    // marker.tip = the just-landed commit's SHA = "hook audited up
    // through this commit." A commit is covered iff its own SHA
    // appears in the log.
    const result = await checkImplementHookCoverage(
      makeArgs({
        unpushed: [
          { sha: 'commit-A', parentSha: 'baseSha', subject: 'feat: A' },
          { sha: 'commit-B', parentSha: 'commit-A', subject: 'feat: B' },
          { sha: 'commit-C', parentSha: 'commit-B', subject: 'feat: C' },
        ],
        logTips: ['commit-A', 'commit-B', 'commit-C'],
      }),
    );
    expect(result.kind).toBe('allow-all-commits-backed');
    if (result.kind !== 'allow-all-commits-backed') return;
    expect(result.checkedCount).toBe(3);
  });

  it('refuses when an unpushed commit has no log entry with its own sha', async () => {
    // commit-B was --no-verify-bypassed: the hook never ran after
    // commit-B landed, so the log has no `tip=commit-B` entry.
    // commit-A and commit-C both have their own tips in the log
    // (the operator ran the hook around B, just not for B).
    const result = await checkImplementHookCoverage(
      makeArgs({
        unpushed: [
          { sha: 'commit-A', parentSha: 'baseSha', subject: 'feat: A' },
          { sha: 'commit-B', parentSha: 'commit-A', subject: 'feat: B (--no-verify bypass)' },
          { sha: 'commit-C', parentSha: 'commit-B', subject: 'feat: C' },
        ],
        logTips: ['commit-A', 'commit-C'],
      }),
    );
    expect(result.kind).toBe('refuse-uncovered-commits');
    if (result.kind !== 'refuse-uncovered-commits') return;
    expect(result.uncovered.length).toBe(1);
    expect(result.uncovered[0]?.sha).toBe('commit-B');
    expect(result.cure).toContain('dw-lifecycle implement-hook');
  });

  it('allows boot case when bootstrap sentinel absent (per AUDIT-20260601-06)', async () => {
    // The sentinel is the load-bearing trigger for boot case (NOT
    // log emptiness). Absent sentinel = first invocation = allow.
    const result = await checkImplementHookCoverage(
      makeArgs({
        unpushed: [
          { sha: 'commit-A', parentSha: 'base', subject: 'first commit' },
        ],
        logTips: [],
        bootstrapped: false,
      }),
    );
    expect(result.kind).toBe('allow-no-prior-run');
  });

  it('refuses when sentinel present but log empty (post-bootstrap log deletion attack)', async () => {
    // Per AUDIT-20260601-06: the bug pre-fix was that log emptiness
    // alone triggered allow. That made the gate re-triggerable by
    // deleting the log file (errant git clean, .dw-lifecycle reset).
    // Post-fix: sentinel present + log empty = refuse (the log was
    // corrupted post-bootstrap).
    const result = await checkImplementHookCoverage(
      makeArgs({
        unpushed: [
          { sha: 'commit-A', parentSha: 'base', subject: 'bypass after log delete' },
        ],
        logTips: [], // log deleted/truncated
        bootstrapped: true, // but sentinel remains
      }),
    );
    expect(result.kind).toBe('refuse-uncovered-commits');
    if (result.kind !== 'refuse-uncovered-commits') return;
    expect(result.uncovered.length).toBe(1);
    expect(result.cure.toLowerCase()).toMatch(/bootstrap sentinel/);
    expect(result.cure.toLowerCase()).toMatch(/deleted|corrupted/);
  });

  it('refuses --no-verify commits on a fresh-bootstrapped project (the original AUDIT-06 attack)', async () => {
    // The exact attack the BLOCKING finding described: fresh project,
    // user does `git commit --no-verify` for a batch, then pushes.
    // Pre-fix: log empty → allow ALL of them.
    // Post-fix: once any hook run has occurred (sentinel written),
    // subsequent --no-verify commits are refused.
    const result = await checkImplementHookCoverage(
      makeArgs({
        unpushed: [
          { sha: 'c1', parentSha: 'base', subject: '--no-verify bypass 1' },
          { sha: 'c2', parentSha: 'c1', subject: '--no-verify bypass 2' },
          { sha: 'c3', parentSha: 'c2', subject: '--no-verify bypass 3' },
        ],
        // Log has one prior hook run (from when the project bootstrapped),
        // but none of the --no-verify commits are in it.
        logTips: ['bootstrap-tip'],
        bootstrapped: true,
      }),
    );
    expect(result.kind).toBe('refuse-uncovered-commits');
    if (result.kind !== 'refuse-uncovered-commits') return;
    expect(result.uncovered.length).toBe(3);
  });

  it('refuses with all uncovered commits listed when multiple bypass AFTER first hook run', async () => {
    // Log has at least one entry (some prior hook ran). Now a fresh
    // batch of commits lands without hook runs — those are uncovered.
    const result = await checkImplementHookCoverage(
      makeArgs({
        unpushed: [
          { sha: 'c1', parentSha: 'base', subject: 'first bypass' },
          { sha: 'c2', parentSha: 'c1', subject: 'second bypass' },
          { sha: 'c3', parentSha: 'c2', subject: 'third bypass' },
        ],
        logTips: ['some-prior-tip'], // log non-empty, but doesn't cover c1/c2/c3
      }),
    );
    expect(result.kind).toBe('refuse-uncovered-commits');
    if (result.kind !== 'refuse-uncovered-commits') return;
    expect(result.uncovered.length).toBe(3);
    expect(result.uncovered.map((u) => u.sha)).toEqual(['c1', 'c2', 'c3']);
  });
});
