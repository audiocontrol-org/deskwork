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

  it('allows when every unpushed commit has a log entry for its parent', async () => {
    const result = await checkImplementHookCoverage(
      makeArgs({
        unpushed: [
          { sha: 'commit-A', parentSha: 'baseSha', subject: 'feat: A' },
          { sha: 'commit-B', parentSha: 'commit-A', subject: 'feat: B' },
          { sha: 'commit-C', parentSha: 'commit-B', subject: 'feat: C' },
        ],
        logTips: ['baseSha', 'commit-A', 'commit-B'],
      }),
    );
    expect(result.kind).toBe('allow-all-commits-backed');
    if (result.kind !== 'allow-all-commits-backed') return;
    expect(result.checkedCount).toBe(3);
  });

  it('refuses when an unpushed commit has no log entry for its parent', async () => {
    const result = await checkImplementHookCoverage(
      makeArgs({
        unpushed: [
          { sha: 'commit-A', parentSha: 'baseSha', subject: 'feat: A' },
          { sha: 'commit-B', parentSha: 'commit-A', subject: 'feat: B (--no-verify bypass)' },
          { sha: 'commit-C', parentSha: 'commit-B', subject: 'feat: C' },
        ],
        // commit-A had hook run (baseSha tip in log); commit-B did
        // NOT (commit-A absent from log) — operator bypassed via
        // --no-verify. commit-C's parent (commit-B) IS in the log
        // because we logged AFTER commit-B landed, but commit-B
        // itself is still uncovered because no log entry shows tip=
        // commit-A.
        logTips: ['baseSha', 'commit-B'],
      }),
    );
    expect(result.kind).toBe('refuse-uncovered-commits');
    if (result.kind !== 'refuse-uncovered-commits') return;
    expect(result.uncovered.length).toBe(1);
    expect(result.uncovered[0]?.sha).toBe('commit-B');
    expect(result.cure).toContain('dw-lifecycle implement-hook');
  });

  it('refuses with all uncovered commits listed when multiple bypass', async () => {
    const result = await checkImplementHookCoverage(
      makeArgs({
        unpushed: [
          { sha: 'c1', parentSha: 'base', subject: 'first bypass' },
          { sha: 'c2', parentSha: 'c1', subject: 'second bypass' },
          { sha: 'c3', parentSha: 'c2', subject: 'third bypass' },
        ],
        logTips: [], // nothing ran; all three bypassed
      }),
    );
    expect(result.kind).toBe('refuse-uncovered-commits');
    if (result.kind !== 'refuse-uncovered-commits') return;
    expect(result.uncovered.length).toBe(3);
    expect(result.uncovered.map((u) => u.sha)).toEqual(['c1', 'c2', 'c3']);
  });
});
