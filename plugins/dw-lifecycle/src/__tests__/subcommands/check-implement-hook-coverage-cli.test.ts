/**
 * Phase 21 — CLI-level tests for the upstream-base-ref behavior of
 * `check-implement-hook-coverage`.
 *
 * The pre-push gate's default range (`origin/<current-branch>..HEAD`)
 * spuriously refuses pushes that merge `origin/main` into a feature
 * branch, because the inherited main commits look "unpushed" relative
 * to the feature-branch tip even though they're already on
 * `origin/main` and gated there. The fix is an `--upstream-base-ref`
 * flag (with `DW_UPSTREAM_BASE_REF` env override) that excludes
 * commits reachable from the upstream base.
 *
 * Tests cover the pure helpers `resolveUpstreamBaseRef` and `buildRange`
 * exposed by the CLI shim. Real-git integration is left to manual smoke;
 * the helpers are pure functions over args/env.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveUpstreamBaseRef,
  buildRange,
} from '../../subcommands/check-implement-hook-coverage.js';

describe('resolveUpstreamBaseRef — Phase 21', () => {
  it('returns the CLI flag value when --upstream-base-ref is passed', () => {
    expect(
      resolveUpstreamBaseRef({ upstreamBaseRef: 'origin/develop' }, {}),
    ).toBe('origin/develop');
  });

  it('returns the env-var value when DW_UPSTREAM_BASE_REF is set and no flag is passed', () => {
    expect(
      resolveUpstreamBaseRef({}, { DW_UPSTREAM_BASE_REF: 'origin/release-1.0' }),
    ).toBe('origin/release-1.0');
  });

  it('prefers the CLI flag over the env var when both are set', () => {
    expect(
      resolveUpstreamBaseRef(
        { upstreamBaseRef: 'origin/develop' },
        { DW_UPSTREAM_BASE_REF: 'origin/release-1.0' },
      ),
    ).toBe('origin/develop');
  });

  it('returns the default `origin/main` when neither flag nor env is set', () => {
    expect(resolveUpstreamBaseRef({}, {})).toBe('origin/main');
  });

  it('honors an explicit override of `origin/main` (back-compat for callers depending on default)', () => {
    expect(
      resolveUpstreamBaseRef({ upstreamBaseRef: 'origin/main' }, {}),
    ).toBe('origin/main');
  });
});

describe('buildRange — Phase 21', () => {
  // The merge-from-main scenario this rule exists to handle: after
  // `git merge origin/main` into a feature branch, every inherited
  // commit appears "unpushed" relative to origin/<feature-branch>.
  // The upstream-base-ref exclusion (`^origin/main`) removes them from
  // the range so only the locally-authored commits remain in scope.
  it('builds the standard rev-list range excluding the upstream base', () => {
    expect(
      buildRange('origin/feature/scope-discovery', 'origin/main'),
    ).toBe('origin/feature/scope-discovery..HEAD ^origin/main');
  });

  it('builds the range against a non-main upstream base (release branch override)', () => {
    expect(
      buildRange('origin/feature/x', 'origin/release-2.0'),
    ).toBe('origin/feature/x..HEAD ^origin/release-2.0');
  });

  // Negative case: when the upstream base ref is empty (operator
  // explicitly opts out), the range MUST fall back to the pre-Phase-21
  // behavior so feature-authored commits without markers are still
  // refused.
  it('falls back to the pre-Phase-21 range when upstream base is empty (no exclusion)', () => {
    expect(buildRange('origin/feature/x', '')).toBe('origin/feature/x..HEAD');
  });
});
