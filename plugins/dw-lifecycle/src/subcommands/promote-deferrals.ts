import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import {
  apply,
  InvalidProposalFileError,
} from '../promote-deferrals/apply.js';
import {
  propose,
  ProposalOutputExistsError,
} from '../promote-deferrals/propose.js';
import type { RunGh } from '../promote-deferrals/types.js';

// Subcommand layer for /dw-lifecycle:promote-deferrals. Mirrors the
// triage-issues subcommand shape (Phase 2) — same two verbs (propose, apply),
// same all-or-nothing pre-validation gate semantics, same partial-success
// recording.

export type Verb = 'propose' | 'apply';

export interface ProposeCliOptions {
  readonly verb: 'propose';
  readonly workplan: string;
  readonly repo?: string;
  readonly outputPath?: string;
  readonly force?: boolean;
}

export interface ApplyCliOptions {
  readonly verb: 'apply';
  readonly fromFile: string;
  readonly repo?: string;
}

export type PromoteDeferralsCliOptions = ProposeCliOptions | ApplyCliOptions;

function parseProposeArgs(args: readonly string[]): ProposeCliOptions {
  let workplan: string | undefined;
  let repo: string | undefined;
  let outputPath: string | undefined;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    switch (flag) {
      case '--workplan': {
        const next = args[++i];
        if (next === undefined) throw new Error('--workplan requires a value.');
        workplan = next;
        break;
      }
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
      case '--force':
        force = true;
        break;
      default:
        throw new Error(`Unknown flag for propose: ${flag}`);
    }
  }
  if (workplan === undefined) {
    throw new Error('--workplan is required (path to the target workplan.md).');
  }
  const base = { verb: 'propose' as const, workplan };
  return {
    ...base,
    ...(repo !== undefined ? { repo } : {}),
    ...(outputPath !== undefined ? { outputPath } : {}),
    ...(force ? { force: true } : {}),
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
        if (next === undefined) throw new Error('--from-file requires a value.');
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

export function parsePromoteDeferralsArgs(
  args: readonly string[],
): PromoteDeferralsCliOptions {
  const verb = args[0];
  if (verb === undefined) {
    throw new Error(
      'Usage: dw-lifecycle promote-deferrals <propose|apply> [flags...]',
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

export interface RunPromoteDeferralsArgs {
  readonly opts: PromoteDeferralsCliOptions;
  readonly projectRoot: string;
  readonly now: Date;
  readonly runGh: RunGh;
  readonly stdout: NodeJS.WriteStream;
  readonly detectRepo: () => string;
}

export function runPromoteDeferrals(args: RunPromoteDeferralsArgs): number {
  const { opts, projectRoot, now, runGh, stdout, detectRepo } = args;
  if (opts.verb === 'propose') {
    const workplanPath = isAbsolute(opts.workplan)
      ? opts.workplan
      : resolve(projectRoot, opts.workplan);
    const repo = opts.repo ?? detectRepo();
    let result;
    try {
      result = propose({
        workplanPath,
        repo,
        projectRoot,
        now,
        ...(opts.outputPath !== undefined ? { outputPath: opts.outputPath } : {}),
        ...(opts.force === true ? { force: true } : {}),
      });
    } catch (err) {
      if (err instanceof ProposalOutputExistsError) {
        process.stderr.write(`${err.message}\n`);
        return 2;
      }
      throw err;
    }
    stdout.write(`Wrote proposal: ${result.outputPath}\n`);
    stdout.write(`Workplan: ${result.proposalFile.workplan_path}\n`);
    stdout.write(`Repo: ${result.proposalFile.repo}\n`);
    stdout.write(`Items: ${result.itemCount}\n`);
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
    if (outcome.applied && outcome.result !== null) {
      stdout.write(`  Applied line ${outcome.lineNumber}: ${outcome.result}\n`);
    }
    if (!outcome.applied && !outcome.skipped && outcome.error !== null) {
      stdout.write(`  Failed line ${outcome.lineNumber}: ${outcome.error}\n`);
    }
  }
  const attempted = applied + failed;
  if (attempted === 0) return 0;
  if (applied === 0) return 1;
  return 0;
}

export async function promoteDeferrals(rawArgs: string[]): Promise<void> {
  const opts = parsePromoteDeferralsArgs(rawArgs);
  const root = repoRoot();
  const exitCode = runPromoteDeferrals({
    opts,
    projectRoot: root,
    now: new Date(),
    runGh: defaultRunGh,
    stdout: process.stdout,
    detectRepo: () => detectRepoFromGit(root),
  });
  if (exitCode !== 0) process.exit(exitCode);
}
