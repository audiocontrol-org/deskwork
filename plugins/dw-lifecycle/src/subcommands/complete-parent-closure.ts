// Subcommand layer for /dw-lifecycle:complete-parent-closure.
//
// Two verbs:
//   propose -- walk the closing feature's GitHub issue tree, classify each
//              parent candidate, emit a proposal JSON file + a markdown
//              table for the operator to fill in (disposition +
//              closure_comment per row).
//   apply   -- read a filled-in proposal file, validate, and dispatch one
//              gh issue close per approved row.
//
// The skill is RECOMMENDED, not blocking -- on a structural failure the
// gate refuses with exit 2 so the SKILL.md surfaces the error; on success
// or operator abort it exits 0 and the SKILL.md continues to the doc-move
// step. The exit codes mirror the triage-issues batched-proposal pattern.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { resolveFeatureDir } from '../docs.js';
import { parseFrontmatter } from '../frontmatter.js';
import { repoRoot } from '../repo.js';
import {
  apply,
  InvalidProposalFileError,
  propose,
  ProposalOutputExistsError,
} from '../lifecycle-integration/parent-closure/index.js';
import type {
  RunGh,
  RunGit,
} from '../lifecycle-integration/parent-closure/types.js';

export type Verb = 'propose' | 'apply';

export interface ProposeCliOptions {
  readonly verb: 'propose';
  readonly slug: string;
  readonly targetVersion?: string;
  readonly repo?: string;
  readonly outputPath?: string;
  readonly force?: boolean;
}

export interface ApplyCliOptions {
  readonly verb: 'apply';
  readonly fromFile: string;
  readonly repo?: string;
}

export type CompleteParentClosureCliOptions =
  | ProposeCliOptions
  | ApplyCliOptions;

function parseProposeArgs(args: readonly string[]): ProposeCliOptions {
  let slug: string | undefined;
  let targetVersion: string | undefined;
  let repo: string | undefined;
  let outputPath: string | undefined;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    switch (flag) {
      case '--slug': {
        const next = args[++i];
        if (next === undefined) throw new Error('--slug requires a value.');
        slug = next;
        break;
      }
      case '--target-version': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--target-version requires a value.');
        }
        targetVersion = next;
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
  if (slug === undefined) {
    throw new Error('--slug is required for propose.');
  }
  const base = { verb: 'propose' as const, slug };
  return {
    ...base,
    ...(targetVersion !== undefined ? { targetVersion } : {}),
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

export function parseCompleteParentClosureArgs(
  args: readonly string[],
): CompleteParentClosureCliOptions {
  const verb = args[0];
  if (verb === undefined) {
    throw new Error(
      'Usage: dw-lifecycle complete-parent-closure <propose|apply> [flags...]',
    );
  }
  const rest = args.slice(1);
  if (verb === 'propose') return parseProposeArgs(rest);
  if (verb === 'apply') return parseApplyArgs(rest);
  throw new Error(`Unknown verb: ${verb}. Expected 'propose' or 'apply'.`);
}

function defaultRunGh(args: readonly string[]): string {
  return execFileSync('gh', [...args], { encoding: 'utf8' });
}

function defaultRunGit(cwd: string): RunGit {
  const env = { ...process.env, LC_ALL: 'C' };
  return (args: readonly string[]): string =>
    execFileSync('git', [...args], { cwd, encoding: 'utf8', env });
}

function detectRepoFromGit(root: string): string {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (!match || !match[1]) {
    throw new Error(
      `Could not detect GitHub repo from origin: ${remote}. Pass --repo <owner/repo>.`,
    );
  }
  return match[1];
}

// Loads the closing feature's README frontmatter and extracts the parent
// issue number. The README schema:
//   ---
//   slug: <slug>
//   parentIssue: "#NNN"
//   ---
// `parentIssue` may also be a bare number string ("323") or a number; the
// parser accepts both and the `#`-prefixed form documented in
// /dw-lifecycle:setup's README scaffolding.
function readParentIssue(readmePath: string): number {
  if (!existsSync(readmePath)) {
    throw new Error(
      `Could not read feature README at ${readmePath}: file not found. Run /dw-lifecycle:setup to scaffold the docs directory or pass a slug whose README exists.`,
    );
  }
  const content = readFileSync(readmePath, 'utf8');
  const { data } = parseFrontmatter(content);
  const raw = data.parentIssue;
  if (raw === undefined || raw === null) {
    throw new Error(
      `Feature README ${readmePath} frontmatter is missing 'parentIssue'. Set 'parentIssue: "#NNN"' so the closure walker knows which issue to anchor on.`,
    );
  }
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw <= 0) {
      throw new Error(
        `Feature README ${readmePath} 'parentIssue' must be a positive integer (got ${raw}).`,
      );
    }
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim().replace(/^#/, '');
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(
        `Feature README ${readmePath} 'parentIssue' must be a number or "#NNN" string (got '${raw}').`,
      );
    }
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(
        `Feature README ${readmePath} 'parentIssue' must be a positive integer (got '${raw}').`,
      );
    }
    return n;
  }
  throw new Error(
    `Feature README ${readmePath} 'parentIssue' must be a number or string (got ${typeof raw}).`,
  );
}

function readTargetVersion(readmePath: string): string | null {
  if (!existsSync(readmePath)) return null;
  const content = readFileSync(readmePath, 'utf8');
  const { data } = parseFrontmatter(content);
  const raw = data.targetVersion;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  return null;
}

export interface RunCompleteParentClosureArgs {
  readonly opts: CompleteParentClosureCliOptions;
  readonly projectRoot: string;
  readonly now: Date;
  readonly runGh: RunGh;
  readonly runGit: RunGit;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly detectRepo: () => string;
}

export function runCompleteParentClosure(
  args: RunCompleteParentClosureArgs,
): number {
  const { opts, projectRoot, now, runGh, runGit, stdout, stderr, detectRepo } =
    args;
  if (opts.verb === 'propose') {
    return runPropose({
      opts,
      projectRoot,
      now,
      runGh,
      runGit,
      stdout,
      stderr,
      detectRepo,
    });
  }
  return runApply({ opts, runGh, stdout, stderr });
}

interface RunProposeArgs {
  readonly opts: ProposeCliOptions;
  readonly projectRoot: string;
  readonly now: Date;
  readonly runGh: RunGh;
  readonly runGit: RunGit;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly detectRepo: () => string;
}

function runPropose(args: RunProposeArgs): number {
  const { opts, projectRoot, now, runGh, runGit, stdout, stderr, detectRepo } =
    args;
  const config = loadConfig(projectRoot);
  // README path: docs/<v>/<inProgress-dir>/<slug>/README.md.
  // The feature MUST be in-progress for the closure gate to run (the gate
  // is part of /dw-lifecycle:complete, which only operates on in-progress
  // features). targetVersion is read from the README's own frontmatter when
  // the operator doesn't supply --target-version.
  let targetVersion = opts.targetVersion;
  if (targetVersion === undefined) {
    // Probe the in-progress dir to locate the README so we can read the
    // version from its frontmatter.
    const probeDir = resolveFeatureDir(config, projectRoot, opts.slug, {
      stage: 'inProgress',
    });
    const probeReadme = join(probeDir, 'README.md');
    const fromFrontmatter = readTargetVersion(probeReadme);
    if (fromFrontmatter !== null) {
      targetVersion = fromFrontmatter;
    }
  }
  const featureDir = resolveFeatureDir(config, projectRoot, opts.slug, {
    stage: 'inProgress',
    ...(targetVersion !== undefined ? { targetVersion } : {}),
  });
  const readmePath = join(featureDir, 'README.md');
  const workplanPath = join(featureDir, 'workplan.md');
  let parentIssue: number;
  try {
    parentIssue = readParentIssue(readmePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr.write(`${message}\n`);
    return 2;
  }
  const repo = opts.repo ?? detectRepo();
  let result;
  try {
    result = propose({
      slug: opts.slug,
      parentIssue,
      workplanPath,
      featureDir,
      repo,
      projectRoot,
      now,
      runGh,
      runGit,
      ...(opts.outputPath !== undefined ? { outputPath: opts.outputPath } : {}),
      ...(opts.force === true ? { force: true } : {}),
    });
  } catch (err) {
    if (err instanceof ProposalOutputExistsError) {
      stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }
  stdout.write(`Wrote proposal: ${result.outputPath}\n`);
  stdout.write(`Feature: ${result.proposalFile.feature_slug}\n`);
  stdout.write(`Parent issue: #${result.proposalFile.parent_issue}\n`);
  stdout.write(
    `Feature-complete SHA: ${result.proposalFile.feature_complete_sha}\n`,
  );
  stdout.write(`Items: ${result.proposalFile.items.length}\n`);
  if (result.skipped.length > 0) {
    stdout.write(`Skipped (not surfaced): ${result.skipped.length}\n`);
    for (const s of result.skipped) {
      stdout.write(`  #${s.number} -- ${s.classification}\n`);
    }
  }
  stdout.write('\n');
  stdout.write(result.markdownTable);
  stdout.write('\n');
  return 0;
}

interface RunApplyArgs {
  readonly opts: ApplyCliOptions;
  readonly runGh: RunGh;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
}

function runApply(args: RunApplyArgs): number {
  const { opts, runGh, stdout, stderr } = args;
  let result;
  try {
    result = apply({
      proposalPath: opts.fromFile,
      runGh,
      ...(opts.repo !== undefined ? { repo: opts.repo } : {}),
      warn: (line) => stderr.write(`${line}\n`),
    });
  } catch (err) {
    if (err instanceof InvalidProposalFileError) {
      stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }
  if (result.aborted) {
    stdout.write('Aborted by operator approval ("n").\n');
    return 0;
  }
  const { applied, failed, skipped } = result.summary;
  stdout.write(
    `Applied: ${applied}; Failed: ${failed}; Skipped: ${skipped}\n`,
  );
  for (const outcome of result.outcomes) {
    if (outcome.applied && outcome.result !== null) {
      stdout.write(`  ${outcome.result}\n`);
      continue;
    }
    if (!outcome.applied && !outcome.skipped && outcome.error !== null) {
      stdout.write(`  Failed #${outcome.issueNumber}: ${outcome.error}\n`);
      continue;
    }
    if (
      !outcome.applied &&
      !outcome.skipped &&
      outcome.error === null &&
      outcome.result !== null
    ) {
      stdout.write(`  #${outcome.issueNumber}: ${outcome.result}\n`);
    }
  }
  const attempted = applied + failed;
  if (attempted === 0) return 0;
  if (applied === 0 && failed > 0) return 1;
  return 0;
}

export async function completeParentClosure(rawArgs: string[]): Promise<void> {
  const opts = parseCompleteParentClosureArgs(rawArgs);
  const root = repoRoot();
  const exitCode = runCompleteParentClosure({
    opts,
    projectRoot: root,
    now: new Date(),
    runGh: defaultRunGh,
    runGit: defaultRunGit(root),
    stdout: process.stdout,
    stderr: process.stderr,
    detectRepo: () => detectRepoFromGit(root),
  });
  if (exitCode !== 0) process.exit(exitCode);
}

// Re-exported so the test file can construct absolute paths under tmp
// without depending on `isAbsolute`/`resolve` from node:path directly.
export { isAbsolute, resolve };
