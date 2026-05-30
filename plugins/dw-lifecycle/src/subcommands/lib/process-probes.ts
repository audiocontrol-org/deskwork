// Shared process + filesystem probe stubs for subcommands.
//
// Extracted from a clone surfaced by the scope-discovery pre-commit
// gate: worktree-report and dismantle-worktrees both need the same
// git/gh/fs glue with stderr suppressed.

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';

export function runGitStdout(args: readonly string[]): string {
  try {
    return execFileSync('git', args as string[], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

export function runGhJson(args: readonly string[]): string {
  try {
    return execFileSync('gh', args as string[], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '[]';
  }
}

export function readDirSafe(path: string): readonly string[] {
  try { return readdirSync(path); } catch { return []; }
}

export function statDirSafe(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

export function pathExistsSafe(path: string): boolean {
  try { statSync(path); return true; } catch { return false; }
}
