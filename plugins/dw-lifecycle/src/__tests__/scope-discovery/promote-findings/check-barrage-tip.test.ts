/**
 * Phase 16 Task 1 — check-barrage-tip library tests (TDD-first).
 *
 * Pre-Phase-16, /dw-lifecycle:implement Step 6's gate fused two concerns:
 * "should new work be cross-model audited?" (always yes, per the third-
 * audit-surface thesis) and "should nit findings be scoped vs slushed?"
 * (context-dependent, the dampener's actual job). The fused gate skipped
 * the whole hook when dampener engaged → 70-task burndowns ran with zero
 * audit coverage (#383).
 *
 * Phase 16 splits the concerns. `check-barrage-tip` is the NEW-DIFF
 * guard: the only legitimate skip condition. Per the operator's verbatim
 * framing (2026-05-31): "Do work, audit barrage, if 0 HIGH and 0 MEDIUM
 * findings on the NEW work, put new findings in slush. If there have
 * been 2 consecutive audits on the new work with 0 HIGH findings, put
 * new findings in slush."
 *
 * The barrage ALWAYS fires when there's new diff since the most-recent
 * barrage's tip.sha (Task 2 writes that file at audit-barrage fire-time).
 * No new diff → skip. New diff → fire + lift; dampener decides
 * disposition (slush vs promote).
 *
 * This library is the diff-emptiness guard. Pure-fn with injected
 * filesystem + git side-effects.
 *
 * Test invariants (RED pre-Task-3 implementation):
 *   1. No prior runs → fail-safe to fire (hasNewDiff=true).
 *   2. Latest tip matches HEAD → skip (hasNewDiff=false).
 *   3. Latest tip at HEAD-N → fire with newCommitCount=N.
 *   4. Missing tip.sha → fail-safe to fire.
 */

import { describe, it, expect } from 'vitest';
import { checkBarrageTip } from '../../../scope-discovery/promote-findings/check-barrage-tip.js';

function makeStubs(opts: {
  runDirs: string[];
  tipShas: Record<string, string | null>;
  newCommits: Record<string, number>;
}) {
  return {
    listRunDirs: async () => opts.runDirs,
    readTipSha: async (runDir: string) => opts.tipShas[runDir] ?? null,
    gitRevListCount: async (range: string) => {
      // range is "<tip>..HEAD" — extract the tip
      const tip = range.split('..')[0] ?? '';
      return opts.newCommits[tip] ?? 0;
    },
  };
}

describe('checkBarrageTip — Phase 16 Task 3 (new-diff guard)', () => {
  it('fail-safe to fire when there are no prior barrage runs', async () => {
    const stubs = makeStubs({ runDirs: [], tipShas: {}, newCommits: {} });
    const result = await checkBarrageTip({
      auditRunsDir: '/tmp/audit-runs',
      ...stubs,
    });
    expect(result.hasNewDiff).toBe(true);
    expect(result.lastTipSha).toBeNull();
    expect(result.newCommitCount).toBe(0);
    expect(result.reason.toLowerCase()).toMatch(/no prior barrage/);
  });

  it('skips when the latest run-dir tip.sha matches HEAD (no new diff)', async () => {
    const stubs = makeStubs({
      runDirs: ['/tmp/audit-runs/2026-05-31-1200-feat'],
      tipShas: { '/tmp/audit-runs/2026-05-31-1200-feat': 'abc123' },
      newCommits: { abc123: 0 },
    });
    const result = await checkBarrageTip({
      auditRunsDir: '/tmp/audit-runs',
      ...stubs,
    });
    expect(result.hasNewDiff).toBe(false);
    expect(result.lastTipSha).toBe('abc123');
    expect(result.newCommitCount).toBe(0);
    expect(result.reason.toLowerCase()).toMatch(/no new diff/);
  });

  it('fires when the latest tip.sha trails HEAD by N commits', async () => {
    const stubs = makeStubs({
      runDirs: [
        '/tmp/audit-runs/2026-05-30-1200-feat',
        '/tmp/audit-runs/2026-05-31-1200-feat',
      ],
      tipShas: {
        '/tmp/audit-runs/2026-05-30-1200-feat': 'oldsha',
        '/tmp/audit-runs/2026-05-31-1200-feat': 'def456',
      },
      newCommits: { def456: 3, oldsha: 99 /* ignored — older */ },
    });
    const result = await checkBarrageTip({
      auditRunsDir: '/tmp/audit-runs',
      ...stubs,
    });
    expect(result.hasNewDiff).toBe(true);
    expect(result.lastTipSha).toBe('def456');
    expect(result.newCommitCount).toBe(3);
    expect(result.reason).toMatch(/3 (commit|new)/i);
  });

  it('fail-safe to fire when the latest run-dir is missing tip.sha', async () => {
    const stubs = makeStubs({
      runDirs: ['/tmp/audit-runs/2026-05-31-1200-feat'],
      tipShas: { '/tmp/audit-runs/2026-05-31-1200-feat': null },
      newCommits: {},
    });
    const result = await checkBarrageTip({
      auditRunsDir: '/tmp/audit-runs',
      ...stubs,
    });
    expect(result.hasNewDiff).toBe(true);
    expect(result.lastTipSha).toBeNull();
    expect(result.newCommitCount).toBe(0);
    expect(result.reason.toLowerCase()).toMatch(/missing tip|no tip|tip\.sha/);
  });

  it('uses the MOST RECENT run-dir (last by lexical-sort) when multiple runs exist', async () => {
    // Run-dirs are named by timestamp prefix; lexical sort = chronological
    // sort. Most recent = last in the sorted list. The library MUST pick
    // the last one (not the first or arbitrary order).
    const stubs = makeStubs({
      runDirs: [
        '/tmp/audit-runs/2026-05-29-1200-feat',
        '/tmp/audit-runs/2026-05-30-1200-feat',
        '/tmp/audit-runs/2026-05-31-1200-feat',
      ],
      tipShas: {
        '/tmp/audit-runs/2026-05-29-1200-feat': 'sha-29',
        '/tmp/audit-runs/2026-05-30-1200-feat': 'sha-30',
        '/tmp/audit-runs/2026-05-31-1200-feat': 'sha-31',
      },
      newCommits: { 'sha-29': 50, 'sha-30': 25, 'sha-31': 5 },
    });
    const result = await checkBarrageTip({
      auditRunsDir: '/tmp/audit-runs',
      ...stubs,
    });
    expect(result.lastTipSha).toBe('sha-31');
    expect(result.newCommitCount).toBe(5);
    expect(result.hasNewDiff).toBe(true);
  });
});
