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

  it('allows boot case when log is empty (mirrors check-implement-hook-rans allow-no-prior-run)', async () => {
    // Without this boot case, a freshly-wired project deadlocks: pre-
    // push refuses because no log entries exist, but the first
    // implement-hook run needs an existing push (or a prior commit to
    // mark). Same shape as the commit-msg gate's `allow-no-prior-run`.
    const result = await checkImplementHookCoverage(
      makeArgs({
        unpushed: [
          { sha: 'commit-A', parentSha: 'base', subject: 'first commit' },
        ],
        logTips: [],
      }),
    );
    expect(result.kind).toBe('allow-no-prior-run');
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
