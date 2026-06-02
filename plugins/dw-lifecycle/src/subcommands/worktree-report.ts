// CLI subcommand: dw-lifecycle worktree-report.
//
// Wraps runWorktreeReport with flag parsing and process-boundary glue
// (real git, gh, fs). Pure read; no mutations.

import { runWorktreeReport } from '../worktree-report/index.js';
import {
  formatJson,
  formatMarkdown,
} from '../worktree-report/index.js';
import { repoRoot } from '../repo.js';
import { parsePositiveInt } from './lib/parse-flag-value.js';
import { buildWorktreeReportOptions } from './lib/build-worktree-opts.js';

export interface WorktreeReportCliOptions {
  json: boolean;
  daysThreshold: number;
  thresholdCount: number;
  worktreeBase?: string;
  allowExternal: boolean;
}

function defaults(): WorktreeReportCliOptions {
  return {
    json: false,
    daysThreshold: 30,
    thresholdCount: 3,
    allowExternal: false,
  };
}

export function parseWorktreeReportArgs(args: readonly string[]): WorktreeReportCliOptions {
  const opts = defaults();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--days') {
      opts.daysThreshold = parsePositiveInt('--days', args[++i]);
    } else if (arg === '--threshold-count') {
      opts.thresholdCount = parsePositiveInt('--threshold-count', args[++i]);
    } else if (arg === '--worktree-base') {
      const v = args[++i];
      if (v === undefined || v.length === 0) {
        throw new Error('--worktree-base requires a path.');
      }
      opts.worktreeBase = v;
    } else if (arg === '--allow-external') {
      opts.allowExternal = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage(process.stdout);
      process.exit(0);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return opts;
}

function printUsage(stream: NodeJS.WriteStream): void {
  stream.write(`Usage: dw-lifecycle worktree-report [flags]

Reports all git-registered worktrees + orphan directories under the
worktree-base path. Pure read; no mutations. Sibling of debt-report.

Flags:
  --json                  Emit JSON to stdout (default: markdown).
  --days N                Staleness window in days (default: 30).
  --threshold-count N     Minimum signals to flag stale (default: 3).
  --worktree-base <path>  Override the auto-detected worktree base.
  --allow-external        Include worktrees outside the base path.
  --help                  Show this message.

Auto-detection: the worktree-base is the common parent directory of
all non-bare entries in 'git worktree list --porcelain'. Pass
--worktree-base to override.
`);
}


export async function worktreeReport(args: string[]): Promise<void> {
  let opts: WorktreeReportCliOptions;
  try {
    opts = parseWorktreeReportArgs(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`worktree-report: ${msg}\n`);
    process.exit(2);
    return;
  }

  const projectRoot = repoRoot();
  const report = runWorktreeReport(buildWorktreeReportOptions({
    projectRoot,
    daysThreshold: opts.daysThreshold,
    thresholdCount: opts.thresholdCount,
    ...(opts.worktreeBase !== undefined ? { worktreeBase: opts.worktreeBase } : {}),
    allowExternal: opts.allowExternal,
  }));

  const out = opts.json ? formatJson(report) : formatMarkdown(report);
  process.stdout.write(out);
}
