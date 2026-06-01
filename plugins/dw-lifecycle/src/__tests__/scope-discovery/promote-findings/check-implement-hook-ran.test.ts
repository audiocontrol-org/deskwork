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
}) {
  return {
    repoRoot: '/tmp/fake-project',
    readMarker: async () => opts.marker,
    gitHeadResolver: async () => opts.head,
    isScopeDiscoveryOptedIn: async () => opts.scopeDiscoveryOptedIn ?? true,
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

  it('B. refuses when marker is missing (no hook has ever run)', async () => {
    const result = await checkImplementHookRan(
      makeArgs({
        marker: null,
        head: 'def456abc789',
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

  it('D. allows when scope-discovery is NOT opted-in (project hasnt enrolled)', async () => {
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
