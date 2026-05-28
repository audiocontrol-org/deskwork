import { execFileSync } from 'node:child_process';
import { repoRoot } from '../repo.js';
import { loadConfig } from '../config.js';
import {
  applyArchive,
  planArchive,
  ArchiveBranchApplyError,
} from '../archive-branch/archive.js';
import { ArchiveBranchPreflightError } from '../archive-branch/preflight.js';
import type { RunGit } from '../debt-report/types.js';
import type {
  ArchiveBranchOptions,
  ArchiveResult,
  DryRunPlan,
  RunPush,
} from '../archive-branch/types.js';

// Subcommand layer for /dw-lifecycle:archive-branch — argv parsing +
// orchestration. The actual archive logic lives in src/archive-branch/.

export interface ArchiveBranchCliOptions {
  readonly branch: string;
  readonly rationale: string | null;
  readonly noPush: boolean;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly compareRef: string | null;
}

function defaultRationale(now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `Archived ${yyyy}-${mm}-${dd}; preserved as tag.`;
}

export function parseArchiveBranchArgs(
  args: readonly string[],
): ArchiveBranchCliOptions {
  let branch: string | undefined;
  let rationale: string | null = null;
  let noPush = false;
  let dryRun = false;
  let force = false;
  let compareRef: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    switch (arg) {
      case '--rationale': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--rationale requires a value.');
        }
        rationale = next;
        break;
      }
      case '--compare-ref': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--compare-ref requires a value.');
        }
        compareRef = next;
        break;
      }
      case '--no-push':
      case '--local-only':
        noPush = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--force':
        force = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag: ${arg}`);
        }
        if (branch !== undefined) {
          throw new Error(
            `Unexpected positional argument: ${arg} (branch already supplied as ${branch}).`,
          );
        }
        branch = arg;
    }
  }
  if (branch === undefined) {
    throw new Error(
      'Usage: dw-lifecycle archive-branch <branch> [--rationale "<text>"] [--compare-ref <ref>] [--no-push|--local-only] [--dry-run] [--force]',
    );
  }
  return { branch, rationale, noPush, dryRun, force, compareRef };
}

function defaultRunGit(cwd: string): RunGit {
  // LC_ALL=C pins git's stderr language to English so the apply layer's
  // substring matcher for "remote ref does not exist" / "unable to delete"
  // (used to surface remote-delete failures as a non-fatal skip rather
  // than a fatal error) doesn't silently mis-classify on operators
  // running with a translated locale.
  const env = { ...process.env, LC_ALL: 'C' };
  return (args: readonly string[]): string =>
    execFileSync('git', [...args], { cwd, encoding: 'utf8', env });
}

// RunPush is a type alias of RunGit; the production push factory delegates
// straight to defaultRunGit so env settings (e.g. LC_ALL=C) live in one
// place. The separate name is kept on the API surface so tests can inject
// distinct push-side stubs for network-failure simulation.
function defaultRunPush(cwd: string): RunPush {
  return defaultRunGit(cwd);
}

export interface RunArchiveBranchArgs {
  readonly opts: ArchiveBranchCliOptions;
  readonly projectRoot: string;
  readonly now: Date;
  readonly runGit: RunGit;
  readonly runPush: RunPush;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  /** Pre-resolved compare-ref override. When omitted, the function falls
   * back to the CLI flag, then a default of `origin/main`. The CLI shell
   * (archiveBranch) populates this from the project config. */
  readonly configCompareRef?: string;
}

export function runArchiveBranch(args: RunArchiveBranchArgs): number {
  const { opts, now, runGit, runPush, stdout, stderr, configCompareRef } = args;
  // CLI flag wins over config; config wins over default. The CLI flag's
  // presence overriding config matches operator-supplied flag semantics
  // throughout the dw-lifecycle skill family.
  const compareRef = opts.compareRef ?? configCompareRef ?? 'origin/main';
  const archiveOpts: ArchiveBranchOptions = {
    branch: opts.branch,
    rationale: opts.rationale ?? defaultRationale(now),
    noPush: opts.noPush,
    dryRun: opts.dryRun,
    force: opts.force,
    compareRef,
    now,
  };

  if (opts.dryRun) {
    let plan: DryRunPlan;
    try {
      plan = planArchive({ opts: archiveOpts, runGit });
    } catch (err) {
      return handlePreflightError(err, stderr);
    }
    stdout.write(formatPlan(plan));
    return 0;
  }

  let result: ArchiveResult;
  try {
    result = applyArchive({ opts: archiveOpts, runGit, runPush });
  } catch (err) {
    if (err instanceof ArchiveBranchPreflightError) {
      return handlePreflightError(err, stderr);
    }
    if (err instanceof ArchiveBranchApplyError) {
      stderr.write(`${err.message}\n`);
      return 1;
    }
    throw err;
  }
  stdout.write(formatResult(result));
  return 0;
}

function handlePreflightError(
  err: unknown,
  stderr: NodeJS.WriteStream,
): number {
  if (err instanceof ArchiveBranchPreflightError) {
    stderr.write(`${err.message}\n`);
    // 2 is "usage / pre-flight gate" — distinct from runtime failure (1).
    return 2;
  }
  if (err instanceof Error) {
    stderr.write(`${err.message}\n`);
    return 1;
  }
  stderr.write(`${String(err)}\n`);
  return 1;
}

function formatPlan(plan: DryRunPlan): string {
  const lines: string[] = [
    `Dry-run plan for archiving branch ${plan.branch}:`,
    `Tag: ${plan.tagName}`,
  ];
  if (plan.forceUsed) {
    lines.push('Force mode: novel-commits gate skipped.');
  }
  lines.push('');
  lines.push('Commands that would run:');
  for (const c of plan.commands) {
    lines.push(`  ${c}`);
  }
  lines.push('');
  lines.push('Tag message:');
  for (const tl of plan.tagMessageLines) {
    lines.push(`  ${tl}`);
  }
  lines.push('');
  lines.push('No mutations performed (--dry-run).');
  lines.push('');
  return lines.join('\n');
}

function formatResult(result: ArchiveResult): string {
  const lines = [
    `Archived ${result.branch} -> tag ${result.tagName}`,
    `Last commit: ${result.lastCommitSha} ${result.lastCommitSubject}`,
  ];
  if (result.tagPushed) lines.push('Tag pushed to origin.');
  else lines.push('Tag NOT pushed (--no-push).');
  if (result.remoteBranchDeleted) {
    lines.push('Remote branch deleted.');
  } else if (result.remoteDeleteSkipped) {
    lines.push(`Remote branch: ${result.remoteDeleteSkipReason ?? 'skipped'}.`);
  } else {
    lines.push('Remote branch delete NOT attempted (--no-push).');
  }
  lines.push('');
  lines.push(`To restore: git checkout -b ${result.branch} ${result.tagName}`);
  lines.push('');
  return lines.join('\n');
}

export async function archiveBranch(rawArgs: string[]): Promise<void> {
  const opts = parseArchiveBranchArgs(rawArgs);
  const root = repoRoot();
  const cfg = loadConfig(root);
  const exitCode = runArchiveBranch({
    opts,
    projectRoot: root,
    now: new Date(),
    runGit: defaultRunGit(root),
    runPush: defaultRunPush(root),
    stdout: process.stdout,
    stderr: process.stderr,
    configCompareRef: cfg.branches.archive.compareRef,
  });
  if (exitCode !== 0) process.exit(exitCode);
}
