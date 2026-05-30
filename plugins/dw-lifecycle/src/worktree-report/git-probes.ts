// Per-worktree git-probe primitives for /dw-lifecycle:worktree-report.
//
// Each function takes a worktree path and returns a single observable
// fact about its state. All git failures are caught and returned as a
// safe default (zero / clean / empty) — the report should never throw
// because a single worktree is in a weird state.

import { dirname } from 'node:path';
import type { RunGit } from '../debt-report/types.js';
import type { WorkingTreeState } from './types.js';

export function detectMainWorktreePath(runGit: RunGit, projectRoot: string): string {
  try {
    const out = runGit(['-C', projectRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
    if (out.length === 0) return projectRoot;
    return dirname(out);
  } catch {
    return projectRoot;
  }
}

export function detectCurrentWorktreePath(runGit: RunGit, projectRoot: string): string {
  try {
    return runGit(['-C', projectRoot, 'rev-parse', '--show-toplevel']).trim();
  } catch {
    return projectRoot;
  }
}

export function readAheadBehind(
  runGit: RunGit,
  worktreePath: string,
  branch: string | null,
  base: string,
): { ahead: number; behind: number } {
  if (branch === null) return { ahead: 0, behind: 0 };
  try {
    const out = runGit([
      '-C', worktreePath,
      'rev-list', '--left-right', '--count',
      `${branch}...${base}`,
    ]).trim();
    const [a, b] = out.split(/\s+/);
    const ahead = Number.parseInt(a ?? '0', 10);
    const behind = Number.parseInt(b ?? '0', 10);
    return {
      ahead: Number.isFinite(ahead) ? ahead : 0,
      behind: Number.isFinite(behind) ? behind : 0,
    };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

export function readWorkingTreeState(runGit: RunGit, worktreePath: string): WorkingTreeState {
  try {
    const out = runGit(['-C', worktreePath, 'status', '--porcelain']).trim();
    if (out.length === 0) return 'clean';
    const lines = out.split('\n').filter((l) => l.length > 0);
    return { dirty: lines.length };
  } catch {
    return 'clean';
  }
}

export function readLastCommit(
  runGit: RunGit,
  worktreePath: string,
): { sha: string; date: string } {
  try {
    const out = runGit([
      '-C', worktreePath,
      'log', '-1', '--format=%H|%cI', 'HEAD',
    ]).trim();
    const [sha, date] = out.split('|');
    return { sha: sha ?? '', date: date ?? '' };
  } catch {
    return { sha: '', date: '' };
  }
}

export function branchGoneFromOrigin(
  runGit: RunGit,
  worktreePath: string,
  branch: string | null,
): boolean {
  if (branch === null) return false;
  try {
    const out = runGit([
      '-C', worktreePath,
      'ls-remote', '--heads', 'origin', branch,
    ]).trim();
    return out.length === 0;
  } catch {
    return false;
  }
}

export function localOnlyCommits(
  runGit: RunGit,
  worktreePath: string,
  branch: string | null,
): boolean {
  if (branch === null) return false;
  try {
    const out = runGit([
      '-C', worktreePath,
      'rev-list', '--count', `origin/${branch}..${branch}`,
    ]).trim();
    const n = Number.parseInt(out, 10);
    return Number.isFinite(n) && n > 0;
  } catch {
    return false;
  }
}

export function detectDivergence(
  runGit: RunGit,
  worktreePath: string,
  branch: string | null,
  localHead: string,
): boolean {
  if (branch === null || localHead.length === 0) return false;
  try {
    const remoteRef = runGit([
      '-C', worktreePath,
      'rev-parse', `origin/${branch}`,
    ]).trim();
    if (remoteRef.length === 0) return false;
    if (remoteRef === localHead) return false;
    try {
      runGit([
        '-C', worktreePath,
        'merge-base', '--is-ancestor', remoteRef, localHead,
      ]);
      return false;
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}
