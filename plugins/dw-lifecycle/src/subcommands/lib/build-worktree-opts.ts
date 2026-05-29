// Shared WorktreeReportOptions builder. Extracted from a clone the
// scope-discovery gate caught between worktree-report + dismantle-
// worktrees subcommand layers.

import type { WorktreeReportOptions } from '../../worktree-report/index.js';
import {
  runGitStdout,
  runGhJson,
  readDirSafe,
  statDirSafe,
  pathExistsSafe,
} from './process-probes.js';

export interface BuildWorktreeOptsInput {
  readonly projectRoot: string;
  readonly daysThreshold: number;
  readonly thresholdCount: number;
  readonly worktreeBase?: string;
  readonly allowExternal: boolean;
}

export function buildWorktreeReportOptions(
  input: BuildWorktreeOptsInput,
): WorktreeReportOptions {
  return {
    projectRoot: input.projectRoot,
    daysThreshold: input.daysThreshold,
    thresholdCount: input.thresholdCount,
    ...(input.worktreeBase !== undefined ? { worktreeBase: input.worktreeBase } : {}),
    allowExternal: input.allowExternal,
    now: new Date(),
    runGit: runGitStdout,
    runGh: runGhJson,
    readDir: readDirSafe,
    statDir: statDirSafe,
    pathExists: pathExistsSafe,
  };
}
