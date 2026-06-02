/**
 * Phase 17 Task 1 — check-implement-hook-ran library tests (TDD-first).
 *
 * Per #383's deeper sibling failure mode (the 2026-05-31 session where
 * /dwi shipped 2 task-completion commits without invoking the audit-
 * barrage hook): the agent has discretion at the hook-firing decision,
 * and that discretion was abused on the very implementation of the
 * phase (Phase 16) that was supposed to remove discretion.
 *
 * Phase 17's three-layer mechanization closes this. This library is
 * Layer 2 — the commit-msg gate. It refuses any commit when the hook
 * marker doesn't show a run since the parent commit (i.e., the agent
 * skipped the hook).
 *
 * Operator's directive (2026-05-31, verbatim):
 *   "When to run the barrage should not be a matter of policy and the
 *    agent should have no discretion. It must be mechanized with teeth."
 *
 * Pure-fn shape with injected marker reader + git HEAD resolver so the
 * library is unit-testable without a real .dw-lifecycle/ directory or
 * a tmp git repo per test.
 *
 * Test invariants (RED pre-Task-4 implementation):
 *   A. marker.tip matches HEAD → allow (the hook ran since the prior commit).
 *   B. marker missing entirely → refuse (no hook has ever run; cure
 *      message names the verb to invoke).
 *   C. marker present but tip ≠ HEAD → refuse (stale; the prior commit
 *      landed but the hook wasn't run after it).
 *   D. opt-in boot case (no .dw-lifecycle/scope-discovery/) → allow
 *      (the project hasn't opted into scope-discovery; gate is moot).
 */

import { describe, it, expect } from 'vitest';
import { checkImplementHookRan } from '../../../scope-discovery/promote-findings/check-implement-hook-ran.js';

interface MarkerFixture {
  readonly tip: string;
  readonly timestamp: string;
  readonly runDir: string | null;
  readonly disposition: string;
}

function makeArgs(opts: {
  marker: MarkerFixture | null;
  head: string;
  scopeDiscoveryOptedIn?: boolean;
  hasAnyPriorHookRun?: boolean;
  /**
   * Phase 22 Task 3: ancestry check. Default `true` preserves the
   * existing-test contract (marker.tip lives on the same history line
   * as HEAD — the typical case where the only way for tip !== head is
   * that a commit landed in-between). Diverged-history tests pass
   * `isAncestorOfHead: false` to exercise the new boot-case branch.
   */
  isAncestorOfHead?: boolean;
}) {
  return {
    repoRoot: '/tmp/fake-project',
    readMarker: async () => opts.marker,
    gitHeadResolver: async () => opts.head,
    isScopeDiscoveryOptedIn: async () => opts.scopeDiscoveryOptedIn ?? true,
    // Default: assume prior runs exist (covers the typical case where
    // a marker is being compared against HEAD). Boot-case tests pass
    // `hasAnyPriorHookRun: false` explicitly.
    hasAnyPriorHookRun: async () => opts.hasAnyPriorHookRun ?? true,
    isAncestorOfHead: async () => opts.isAncestorOfHead ?? true,
  };
}

describe('checkImplementHookRan — Phase 17 Task 4 (commit-msg gate)', () => {
  it('A. allows when marker.tip matches HEAD (hook ran since parent commit)', async () => {
    const result = await checkImplementHookRan(
      makeArgs({
        marker: {
          tip: 'abc123def456',
          timestamp: '2026-05-31T20:00:00Z',
          runDir: '/tmp/audit-runs/2026-05-31-2000-feat',
          disposition: 'fired-and-promoted',
        },
        head: 'abc123def456',
      }),
    );
    expect(result.kind).toBe('allow-marker-matches-head');
    if (result.kind !== 'allow-marker-matches-head') return; // type-narrow
    expect(result.markerTip).toBe('abc123def456');
    expect(result.reason.toLowerCase()).toMatch(/hook ran|matches head/);
  });

  it('B. refuses when marker is missing AND prior runs exist (stale-state: marker was deleted)', async () => {
    // Per AUDIT-20260531-17: missing marker + prior runs = the marker
    // was deleted or corrupted (not a fresh project). Refuse.
    const result = await checkImplementHookRan(
      makeArgs({
        marker: null,
        head: 'def456abc789',
        hasAnyPriorHookRun: true,
      }),
    );
    expect(result.kind).toBe('refuse-marker-missing');
    if (result.kind !== 'refuse-marker-missing') return;
    expect(result.head).toBe('def456abc789');
    expect(result.cure).toMatch(/dw-lifecycle implement-hook/);
    expect(result.cure).toMatch(/--feature/);
  });

  it('C. refuses when marker.tip is stale (hook ran for a prior commit, not the current parent)', async () => {
    const result = await checkImplementHookRan(
      makeArgs({
        marker: {
          tip: 'oldcommit0000',
          timestamp: '2026-05-30T15:00:00Z',
          runDir: '/tmp/audit-runs/2026-05-30-1500-feat',
          disposition: 'fired-and-slushed',
        },
        head: 'newcommit1111',
      }),
    );
    expect(result.kind).toBe('refuse-marker-stale');
    if (result.kind !== 'refuse-marker-stale') return;
    expect(result.markerTip).toBe('oldcommit0000');
    expect(result.head).toBe('newcommit1111');
    expect(result.cure).toMatch(/dw-lifecycle implement-hook/);
  });

  it('D1. allows boot case: opted-in but no marker AND no prior hook-run-log entries', async () => {
    // Per AUDIT-20260531-17: a freshly-opted-in project's first commit
    // must be allowed. Distinguishing "boot case" from "stale state"
    // requires checking the hook-run-log for prior entries.
    const result = await checkImplementHookRan(
      makeArgs({
        marker: null,
        head: 'firstcommit',
        scopeDiscoveryOptedIn: true,
        hasAnyPriorHookRun: false,
      }),
    );
    expect(result.kind).toBe('allow-no-prior-run');
    if (result.kind !== 'allow-no-prior-run') return;
    expect(result.reason.toLowerCase()).toMatch(/opt|boot|no prior/);
  });

  it('D2. allows when scope-discovery is NOT opted-in (project hasnt enrolled)', async () => {
    // Projects without `.dw-lifecycle/scope-discovery/` are not gate-
    // enrolled; the commit-msg hook is a no-op for them. Same pattern
    // as audit-barrage hook silent-skip when scope-discovery is absent
    // (per SKILL.md "When .dw-lifecycle/scope-discovery/ is absent in
    // the project, the hook is silently skipped").
    const result = await checkImplementHookRan(
      makeArgs({
        marker: null,
        head: 'whatever',
        scopeDiscoveryOptedIn: false,
      }),
    );
    expect(result.kind).toBe('allow-not-opted-in');
    if (result.kind !== 'allow-not-opted-in') return;
    expect(result.reason.toLowerCase()).toMatch(/scope-discovery|opt-in|not enrolled/);
  });

  it('cure message names the exact verb invocation (not paraphrased)', async () => {
    // Per the operator's framing on cure messages (#347 and friends):
    // a cure that doesn't quote the exact command the operator can run
    // is half-broken. Both refusal modes must surface the literal verb
    // string.
    const missing = await checkImplementHookRan(
      // hasAnyPriorHookRun defaults to true → this triggers the
      // refuse-marker-missing branch (stale state, not boot).
      makeArgs({ marker: null, head: 'aaa' }),
    );
    const stale = await checkImplementHookRan(
      makeArgs({
        marker: { tip: 'bbb', timestamp: 't', runDir: null, disposition: 'no-new-diff-skip' },
        head: 'aaa',
      }),
    );
    expect(missing.kind).toBe('refuse-marker-missing');
    expect(stale.kind).toBe('refuse-marker-stale');
    if (missing.kind === 'refuse-marker-missing') {
      expect(missing.cure).toContain('dw-lifecycle implement-hook');
    }
    if (stale.kind === 'refuse-marker-stale') {
      expect(stale.cure).toContain('dw-lifecycle implement-hook');
    }
  });
});

// Phase 22 Task 3 (#399 Friction 1): a tracked last-hook-run.json on
// origin/main can be reset into a feature branch's tree via
// `git reset --hard origin/main`. The reset overwrites the marker with
// main's value, whose `tip` points at a commit on main's history that
// is no longer an ancestor of the post-reset HEAD. The pre-fix gate
// refused every subsequent commit with "marker stale" — Friction 1.
//
// The runtime guard: when marker.tip ≠ HEAD AND marker.tip is NOT an
// ancestor of HEAD, treat as boot case (allow). Same-history-line stale
// state remains a refuse.
describe('checkImplementHookRan — diverged-history boot case (#399 Friction 1)', () => {
  it('allows when marker.tip is not an ancestor of HEAD (history diverged via reset/rebase/sync)', async () => {
    const result = await checkImplementHookRan(
      makeArgs({
        marker: {
          tip: 'mainTip',
          timestamp: 't',
          runDir: null,
          disposition: 'fired-and-promoted',
        },
        head: 'featureTipAfterReset',
        isAncestorOfHead: false, // marker.tip lives on main, HEAD lives on a diverged feature line
      }),
    );
    expect(result.kind).toBe('allow-marker-diverged-history');
    if (result.kind !== 'allow-marker-diverged-history') return;
    expect(result.markerTip).toBe('mainTip');
    expect(result.head).toBe('featureTipAfterReset');
    expect(result.reason).toMatch(/diverged|reset|sync|rebase/i);
    expect(result.reason).toContain('#399');
  });

  it('still refuses when marker.tip IS an ancestor of HEAD but ≠ HEAD (genuine stale on same history line)', async () => {
    const result = await checkImplementHookRan(
      makeArgs({
        marker: {
          tip: 'parentSha',
          timestamp: 't',
          runDir: null,
          disposition: 'fired-and-promoted',
        },
        head: 'childSha',
        isAncestorOfHead: true, // parentSha is an ancestor of childSha (same history line)
      }),
    );
    expect(result.kind).toBe('refuse-marker-stale');
    if (result.kind !== 'refuse-marker-stale') return;
    expect(result.cure).toContain('dw-lifecycle implement-hook');
  });

  it('does NOT consult isAncestorOfHead when marker.tip === HEAD (short-circuit)', async () => {
    let ancestryCalls = 0;
    const result = await checkImplementHookRan({
      repoRoot: '/tmp/fake-project',
      readMarker: async () => ({
        tip: 'sameSha',
        timestamp: 't',
        runDir: null,
        disposition: 'no-new-diff-skip',
      }),
      gitHeadResolver: async () => 'sameSha',
      isScopeDiscoveryOptedIn: async () => true,
      hasAnyPriorHookRun: async () => true,
      isAncestorOfHead: async () => {
        ancestryCalls += 1;
        return true;
      },
    });
    expect(result.kind).toBe('allow-marker-matches-head');
    expect(ancestryCalls).toBe(0); // tip === HEAD short-circuited before the ancestry check
  });

  it('still allows boot case when no marker AND no prior runs (pre-existing behavior unchanged)', async () => {
    const result = await checkImplementHookRan(
      makeArgs({
        marker: null,
        head: 'firstCommit',
        hasAnyPriorHookRun: false,
        // isAncestorOfHead is moot here — the marker-missing branch fires first.
      }),
    );
    expect(result.kind).toBe('allow-no-prior-run');
  });
});
