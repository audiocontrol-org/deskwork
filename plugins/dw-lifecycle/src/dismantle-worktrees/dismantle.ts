// Single-worktree dismantle primitive.
//
// Pre-flight refuses on safety-rail violations; on clear, removes the
// worktree via `git worktree remove` and (optionally) the branch via
// `git branch -d`. With `--archive-first`, composes with the
// archive-branch helper to tag + push the branch before removal.

import {
  readWorkingTreeState,
  localOnlyCommits,
  detectDivergence,
} from '../worktree-report/git-probes.js';
import { applyArchive } from '../archive-branch/archive.js';
import type { ArchiveBranchOptions } from '../archive-branch/types.js';
import { runPreflight, type ProbedState } from './preflight.js';
import type {
  DismantleContext,
  DismantleOptions,
} from './types.js';

export interface DismantleResult {
  readonly path: string;
  readonly removedWorktree: boolean;
  readonly removedBranch: boolean;
  readonly tagCreated: string | null;
}

export interface DismantleArgs {
  readonly worktreePath: string;
  readonly branch: string | null;
  readonly head: string;
  readonly ctx: DismantleContext;
  readonly opts: DismantleOptions;
  /**
   * When true, the worktree is already known to git (e.g. it came from a
   * scan). Skip the live `git worktree list` check.
   */
  readonly isKnownToGit: boolean;
}

export function dismantleWorktree(args: DismantleArgs): DismantleResult {
  const { worktreePath, branch, head, ctx, opts, isKnownToGit } = args;

  // Probe live state for the gate checks.
  const wt = readWorkingTreeState(ctx.runGit, worktreePath);
  const state: ProbedState = {
    isDirty: wt !== 'clean',
    hasLocalOnlyCommits: localOnlyCommits(ctx.runGit, worktreePath, branch),
    isDivergent: detectDivergence(ctx.runGit, worktreePath, branch, head),
    isKnownToGit,
  };

  runPreflight({ worktreePath, branch, ctx, opts }, state);

  // Order matters: remove the worktree first so the branch is loose,
  // THEN archive-branch (which refuses on checked-out branches).
  //
  // Use --force when allowDirty or forceDiscard is set; `git worktree
  // remove` refuses on uncommitted changes / divergent state by default.
  const removeArgs = ['worktree', 'remove', worktreePath];
  if (opts.allowDirty || opts.forceDiscard) {
    removeArgs.splice(2, 0, '--force');
  }
  ctx.runGit(removeArgs);

  let tagCreated: string | null = null;
  let removedBranch = false;
  if (opts.archiveFirst && branch !== null) {
    const archiveOpts: ArchiveBranchOptions = {
      branch,
      rationale: opts.reason ?? `archived alongside worktree dismantle on ${new Date().toISOString().slice(0, 10)}`,
      compareRef: 'origin/main',
      noPush: false,
      dryRun: false,
      force: opts.forceDiscard,
      now: new Date(),
    };
    const archiveResult = applyArchive({
      opts: archiveOpts,
      runGit: ctx.runGit,
      runPush: ctx.runGit,
    });
    tagCreated = archiveResult.tagName;
    removedBranch = true;  // applyArchive deletes the branch as part of the archive sequence
  }
  // Without --archive-first, the loose branch is left in place. The
  // operator chose not to preserve it via a tag; if they want it gone,
  // they pass --archive-first.

  return {
    path: worktreePath,
    removedWorktree: true,
    removedBranch,
    tagCreated,
  };
}
