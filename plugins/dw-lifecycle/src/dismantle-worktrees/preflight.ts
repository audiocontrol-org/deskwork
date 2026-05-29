// Pre-flight safety rails for dismantle-worktrees.
//
// Each gate has a single observable failure shape with an operator-
// actionable message. The dismantle primitive runs the gates before
// any mutation; failure throws DismantleWorktreesPreflightError.

import { validateSubstantiveReason } from '../promote-deferrals/substantive-reason.js';
import type { DismantleContext, DismantleOptions } from './types.js';

export type PreflightKind =
  | 'is-current'
  | 'is-main'
  | 'external-path'
  | 'dirty-without-reason'
  | 'local-only-without-reason'
  | 'divergence'
  | 'reason-not-substantive'
  | 'unknown-worktree';

export class DismantleWorktreesPreflightError extends Error {
  readonly kind: PreflightKind;
  constructor(kind: PreflightKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'DismantleWorktreesPreflightError';
  }
}

export interface PreflightProbeInput {
  readonly worktreePath: string;
  readonly branch: string | null;
  readonly ctx: DismantleContext;
  readonly opts: DismantleOptions;
}

/**
 * Probes that need live git state. Return a record the preflight runner
 * checks. Surfaced as an interface so the apply layer can inject a
 * pre-scanned worktree state (avoiding double-shell-out).
 */
export interface ProbedState {
  readonly isDirty: boolean;
  readonly hasLocalOnlyCommits: boolean;
  readonly isDivergent: boolean;
  readonly isKnownToGit: boolean;
}

export function runPreflight(
  input: PreflightProbeInput,
  state: ProbedState,
): void {
  const { worktreePath, ctx, opts } = input;

  if (worktreePath === ctx.currentWorktreePath) {
    throw new DismantleWorktreesPreflightError(
      'is-current',
      `Cannot dismantle the current worktree (${worktreePath}). Run the verb from outside this worktree (e.g. from the main repo).`,
    );
  }

  if (worktreePath === ctx.mainWorktreePath) {
    throw new DismantleWorktreesPreflightError(
      'is-main',
      `Cannot dismantle the main worktree (${worktreePath}). The main worktree is the project's anchor.`,
    );
  }

  if (!state.isKnownToGit) {
    throw new DismantleWorktreesPreflightError(
      'unknown-worktree',
      `Worktree at ${worktreePath} is not registered with git. Use 'git worktree prune' for orphan directories.`,
    );
  }

  if (!opts.allowExternal && ctx.worktreeBase.length > 0) {
    if (!worktreePath.startsWith(ctx.worktreeBase)) {
      throw new DismantleWorktreesPreflightError(
        'external-path',
        `Worktree at ${worktreePath} is outside the worktree-base path (${ctx.worktreeBase}). Pass --allow-external to dismantle it.`,
      );
    }
  }

  if (state.isDirty && !opts.allowDirty) {
    throw new DismantleWorktreesPreflightError(
      'dirty-without-reason',
      `Worktree at ${worktreePath} has uncommitted changes. Pass --allow-dirty --reason "<substantive>" to dismantle anyway.`,
    );
  }

  if (state.hasLocalOnlyCommits && !opts.forceDiscard) {
    throw new DismantleWorktreesPreflightError(
      'local-only-without-reason',
      `Worktree at ${worktreePath} has local-only commits not pushed to origin. Pass --force-discard --reason "<substantive>" to discard them.`,
    );
  }

  if (state.isDivergent && !opts.acceptDivergence) {
    throw new DismantleWorktreesPreflightError(
      'divergence',
      `Worktree's branch at ${worktreePath} diverges from origin (force-push detected). Pass --accept-divergence to dismantle.`,
    );
  }

  // Substantive-reason gate fires when either bypass flag is set.
  // The reason must satisfy the validator's ≥40 char + no-banned-phrase
  // rule; this is the same gate :promote-deferrals + :complete-gate use.
  if (opts.allowDirty || opts.forceDiscard) {
    const result = validateSubstantiveReason(opts.reason ?? '');
    if (!result.valid) {
      throw new DismantleWorktreesPreflightError(
        'reason-not-substantive',
        `--reason rejected: ${result.reason}`,
      );
    }
  }
}
