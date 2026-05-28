import { execFileSync } from 'node:child_process';
import { repoRoot } from '../repo.js';
import { apply, InvalidProposalFileError } from '../triage-issues/apply.js';
import { propose } from '../triage-issues/propose.js';
import type { RunGh } from '../triage-issues/types.js';

// Subcommand layer for /dw-lifecycle:triage-issues. The verb selects which
// half of the batched-proposal protocol runs:
//   propose → fetch + emit a proposals JSON file + markdown table
//   apply   → consume a filled-in proposals JSON file + dispatch gh mutations

export type Verb = 'propose' | 'apply';

export interface ProposeCliOptions {
  readonly verb: 'propose';
  readonly bucket: string;
  readonly limit: number;
  readonly repo?: string;
  readonly outputPath?: string;
}

export interface ApplyCliOptions {
  readonly verb: 'apply';
  readonly fromFile: string;
  readonly repo?: string;
}

export type TriageIssuesCliOptions = ProposeCliOptions | ApplyCliOptions;

const DEFAULT_LIMIT = 10;

function parsePositiveInt(flag: string, raw: string | undefined): number {
  if (raw === undefined) throw new Error(`${flag} requires a numeric value.`);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${flag} must be a positive integer (got '${raw}').`);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${flag} must be a positive integer (got '${raw}').`);
  }
  return n;
}

function parseProposeArgs(args: readonly string[]): ProposeCliOptions {
  let bucket: string | undefined;
  let limit = DEFAULT_LIMIT;
  let repo: string | undefined;
  let outputPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    switch (flag) {
      case '--bucket': {
        const next = args[++i];
        if (next === undefined) throw new Error('--bucket requires a value.');
        bucket = next;
        break;
      }
      case '--limit':
        limit = parsePositiveInt('--limit', args[++i]);
        break;
      case '--repo': {
        const next = args[++i];
        if (next === undefined) throw new Error('--repo requires a value.');
        repo = next;
        break;
      }
      case '--output': {
        const next = args[++i];
        if (next === undefined) throw new Error('--output requires a value.');
        outputPath = next;
        break;
      }
      default:
        throw new Error(`Unknown flag for propose: ${flag}`);
    }
  }
  if (bucket === undefined) {
    throw new Error(
      '--bucket is required. Built-in buckets: stale-30d, unlabeled, bug-no-comment-7d.',
    );
  }
  const base = { verb: 'propose' as const, bucket, limit };
  return {
    ...base,
    ...(repo !== undefined ? { repo } : {}),
    ...(outputPath !== undefined ? { outputPath } : {}),
  };
}

function parseApplyArgs(args: readonly string[]): ApplyCliOptions {
  let fromFile: string | undefined;
  let repo: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    switch (flag) {
      case '--from-file': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--from-file requires a value.');
        }
        fromFile = next;
        break;
      }
      case '--repo': {
        const next = args[++i];
        if (next === undefined) throw new Error('--repo requires a value.');
        repo = next;
        break;
      }
      default:
        throw new Error(`Unknown flag for apply: ${flag}`);
    }
  }
  if (fromFile === undefined) {
    throw new Error('--from-file is required for apply.');
  }
  return {
    verb: 'apply',
    fromFile,
    ...(repo !== undefined ? { repo } : {}),
  };
}

export function parseTriageIssuesArgs(args: readonly string[]): TriageIssuesCliOptions {
  const verb = args[0];
  if (verb === undefined) {
    throw new Error(
      'Usage: dw-lifecycle triage-issues <propose|apply> [flags...]',
    );
  }
  const rest = args.slice(1);
  if (verb === 'propose') return parseProposeArgs(rest);
  if (verb === 'apply') return parseApplyArgs(rest);
  throw new Error(
    `Unknown verb: ${verb}. Expected 'propose' or 'apply'.`,
  );
}

function defaultRunGh(args: readonly string[]): string {
  return execFileSync('gh', [...args], { encoding: 'utf8' });
}

function detectRepoFromGit(root: string): string {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (!match) {
    throw new Error(
      `Could not detect GitHub repo from origin: ${remote}. Pass --repo <owner/repo>.`,
    );
  }
  const repo = match[1];
  if (!repo) {
    throw new Error(`Could not detect GitHub repo from origin: ${remote}.`);
  }
  return repo;
}

export interface RunTriageIssuesArgs {
  readonly opts: TriageIssuesCliOptions;
  readonly projectRoot: string;
  readonly now: Date;
  readonly runGh: RunGh;
  readonly stdout: NodeJS.WriteStream;
  readonly detectRepo: () => string;
}

// Library-shaped entry point used by tests; the wrapping triageIssues()
// below handles environment defaults (process.argv, real gh, real cwd).
// The subcommand returns the process exit code so the caller can map verbs'
// failure modes to the documented exit semantics.
export function runTriageIssues(args: RunTriageIssuesArgs): number {
  const { opts, projectRoot, now, runGh, stdout, detectRepo } = args;
  if (opts.verb === 'propose') {
    const repo = opts.repo ?? detectRepo();
    const result = propose({
      bucket: opts.bucket,
      limit: opts.limit,
      repo,
      projectRoot,
      now,
      runGh,
      ...(opts.outputPath !== undefined ? { outputPath: opts.outputPath } : {}),
    });
    stdout.write(`Wrote proposal: ${result.outputPath}\n`);
    stdout.write(`Bucket: ${result.proposalFile.bucket}\n`);
    stdout.write(`Query: ${result.proposalFile.query}\n`);
    stdout.write(`Items: ${result.proposalFile.items.length}\n`);
    stdout.write('\n');
    stdout.write(result.markdownTable);
    stdout.write('\n');
    return 0;
  }
  let result;
  try {
    result = apply({
      proposalPath: opts.fromFile,
      runGh,
      ...(opts.repo !== undefined ? { repo: opts.repo } : {}),
    });
  } catch (err) {
    if (err instanceof InvalidProposalFileError) {
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }
  if (result.aborted) {
    stdout.write('Aborted by operator approval ("n").\n');
    return 0;
  }
  const { applied, failed, skipped } = result.summary;
  stdout.write(`Applied: ${applied}; Failed: ${failed}; Skipped: ${skipped}\n`);
  for (const outcome of result.outcomes) {
    if (!outcome.applied && !outcome.skipped && outcome.error !== null) {
      stdout.write(`  Failed #${outcome.issueNumber}: ${outcome.error}\n`);
    }
  }
  // No items attempted (everything skipped) → 0; some succeeded → 0;
  // every attempted item failed → 1.
  const attempted = applied + failed;
  if (attempted === 0) return 0;
  if (applied === 0) return 1;
  return 0;
}

export async function triageIssues(rawArgs: string[]): Promise<void> {
  const opts = parseTriageIssuesArgs(rawArgs);
  const root = repoRoot();
  const exitCode = runTriageIssues({
    opts,
    projectRoot: root,
    now: new Date(),
    runGh: defaultRunGh,
    stdout: process.stdout,
    detectRepo: () => detectRepoFromGit(root),
  });
  if (exitCode !== 0) process.exit(exitCode);
}
