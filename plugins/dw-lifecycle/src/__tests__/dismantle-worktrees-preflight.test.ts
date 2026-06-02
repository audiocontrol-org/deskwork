import { describe, it, expect } from 'vitest';
import {
  runPreflight,
  DismantleWorktreesPreflightError,
  type PreflightProbeInput,
  type ProbedState,
} from '../dismantle-worktrees/preflight.js';
import type { DismantleContext, DismantleOptions } from '../dismantle-worktrees/types.js';

function makeCtx(over: Partial<DismantleContext> = {}): DismantleContext {
  return {
    runGit: () => '',
    projectRoot: '/repo',
    currentWorktreePath: '/repo/main',
    mainWorktreePath: '/repo/main',
    worktreeBase: '/work',
    ...over,
  };
}

function makeOpts(over: Partial<DismantleOptions> = {}): DismantleOptions {
  return {
    archiveFirst: false,
    allowDirty: false,
    forceDiscard: false,
    acceptDivergence: false,
    allowExternal: false,
    ...over,
  };
}

function cleanState(over: Partial<ProbedState> = {}): ProbedState {
  return {
    isDirty: false,
    hasLocalOnlyCommits: false,
    isDivergent: false,
    isKnownToGit: true,
    ...over,
  };
}

function input(
  worktreePath: string,
  ctx: DismantleContext,
  opts: DismantleOptions,
): PreflightProbeInput {
  return { worktreePath, branch: 'feature/x', ctx, opts };
}

describe('dismantle-worktrees preflight', () => {
  it('refuses on the current worktree', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a' });
    expect(() =>
      runPreflight(input('/work/feat-a', ctx, makeOpts()), cleanState()),
    ).toThrow(DismantleWorktreesPreflightError);
    try {
      runPreflight(input('/work/feat-a', ctx, makeOpts()), cleanState());
    } catch (err) {
      expect(err).toBeInstanceOf(DismantleWorktreesPreflightError);
      expect((err as DismantleWorktreesPreflightError).kind).toBe('is-current');
    }
  });

  it('refuses on the main worktree', () => {
    const ctx = makeCtx({ mainWorktreePath: '/repo/main', currentWorktreePath: '/work/feat-a' });
    try {
      runPreflight(input('/repo/main', ctx, makeOpts()), cleanState());
    } catch (err) {
      expect((err as DismantleWorktreesPreflightError).kind).toBe('is-main');
    }
  });

  it('refuses on unknown worktree (not registered with git)', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a' });
    try {
      runPreflight(input('/work/ghost', ctx, makeOpts({ allowExternal: true })), cleanState({ isKnownToGit: false }));
    } catch (err) {
      expect((err as DismantleWorktreesPreflightError).kind).toBe('unknown-worktree');
    }
  });

  it('refuses on external path when --allow-external is false', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a', worktreeBase: '/work' });
    try {
      runPreflight(input('/elsewhere/feat-b', ctx, makeOpts()), cleanState());
    } catch (err) {
      expect((err as DismantleWorktreesPreflightError).kind).toBe('external-path');
    }
  });

  it('accepts external path when --allow-external is true', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a', worktreeBase: '/work' });
    expect(() =>
      runPreflight(input('/elsewhere/feat-b', ctx, makeOpts({ allowExternal: true })), cleanState()),
    ).not.toThrow();
  });

  it('refuses on dirty working tree without --allow-dirty', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a' });
    try {
      runPreflight(input('/work/feat-b', ctx, makeOpts()), cleanState({ isDirty: true }));
    } catch (err) {
      expect((err as DismantleWorktreesPreflightError).kind).toBe('dirty-without-reason');
    }
  });

  it('refuses on dirty + --allow-dirty but no reason', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a' });
    try {
      runPreflight(
        input('/work/feat-b', ctx, makeOpts({ allowDirty: true })),
        cleanState({ isDirty: true }),
      );
    } catch (err) {
      expect((err as DismantleWorktreesPreflightError).kind).toBe('reason-not-substantive');
    }
  });

  it('refuses on dirty + --allow-dirty + short reason', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a' });
    try {
      runPreflight(
        input('/work/feat-b', ctx, makeOpts({ allowDirty: true, reason: 'too short' })),
        cleanState({ isDirty: true }),
      );
    } catch (err) {
      expect((err as DismantleWorktreesPreflightError).kind).toBe('reason-not-substantive');
    }
  });

  it('refuses on dirty + --allow-dirty + reason containing banned hedge', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a' });
    try {
      runPreflight(
        input('/work/feat-b', ctx, makeOpts({
          allowDirty: true,
          reason: 'will fix later; just for now we accept the dirty tree for cleanup batch',
        })),
        cleanState({ isDirty: true }),
      );
    } catch (err) {
      expect((err as DismantleWorktreesPreflightError).kind).toBe('reason-not-substantive');
      expect((err as Error).message).toMatch(/banned hedge/);
    }
  });

  it('accepts dirty + --allow-dirty + substantive reason', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a' });
    expect(() =>
      runPreflight(
        input('/work/feat-b', ctx, makeOpts({
          allowDirty: true,
          reason: 'operator verified the uncommitted edits are notes that already moved into the PR description on origin',
        })),
        cleanState({ isDirty: true }),
      ),
    ).not.toThrow();
  });

  it('refuses on local-only commits without --force-discard', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a' });
    try {
      runPreflight(
        input('/work/feat-b', ctx, makeOpts()),
        cleanState({ hasLocalOnlyCommits: true }),
      );
    } catch (err) {
      expect((err as DismantleWorktreesPreflightError).kind).toBe('local-only-without-reason');
    }
  });

  it('refuses on divergence without --accept-divergence', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a' });
    try {
      runPreflight(
        input('/work/feat-b', ctx, makeOpts()),
        cleanState({ isDivergent: true }),
      );
    } catch (err) {
      expect((err as DismantleWorktreesPreflightError).kind).toBe('divergence');
    }
  });

  it('accepts divergence + --accept-divergence', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a' });
    expect(() =>
      runPreflight(
        input('/work/feat-b', ctx, makeOpts({ acceptDivergence: true })),
        cleanState({ isDivergent: true }),
      ),
    ).not.toThrow();
  });

  it('happy path: clean state, default options, in-base worktree', () => {
    const ctx = makeCtx({ currentWorktreePath: '/work/feat-a' });
    expect(() =>
      runPreflight(input('/work/feat-b', ctx, makeOpts()), cleanState()),
    ).not.toThrow();
  });
});
