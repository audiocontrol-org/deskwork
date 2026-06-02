/**
 * plugins/dw-lifecycle/src/subcommands/check-implement-hook-coverage.ts
 *
 * Phase 17 Task 5 — CLI shim for the pre-push gate. Wired into the
 * project's `pre-push` hook chain alongside any existing gates.
 *
 *   dw-lifecycle check-implement-hook-coverage
 *     [--remote <name>]
 *     [--remote-tip-ref <ref>]
 *     [--repo-root <path>]
 *     [--help]
 *
 * Exit codes:
 *   0 — allow push (all unpushed commits have hook-run entries OR
 *       project not opted in OR no unpushed commits).
 *   1 — refuse push (uncovered commits). Stderr lists them + cure.
 *   2 — config error.
 *
 * Default remote-tip-ref: `origin/<current-branch>`. Override when
 * pushing to a different branch.
 */

import { execFileSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import {
  readHookRunLog,
  hasBootstrapSentinel,
} from '../scope-discovery/promote-findings/hook-run-log.js';
import {
  checkImplementHookCoverage,
  type CheckImplementHookCoverageResult,
  type UnpushedCommit,
} from '../scope-discovery/promote-findings/check-implement-hook-coverage.js';

export interface CoverageCliOptions {
  readonly remoteTipRef?: string;
  readonly remote?: string;
  readonly repoRoot?: string;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: CoverageCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle check-implement-hook-coverage',
  '    [--remote <name>]',
  '    [--remote-tip-ref <ref>]',
  '    [--repo-root <path>]',
  '    [--help]',
  '',
  '--remote <name>          Remote name. Default: origin.',
  '--remote-tip-ref <ref>   Override remote tip ref (e.g. origin/main).',
  '                         Default: <remote>/<current-branch>.',
  '--repo-root <path>       Project root. Default: cwd.',
  '',
  'Exit codes:',
  '  0  allow push (all unpushed commits backed by hook-run entries)',
  '  1  refuse push (uncovered commits; stderr lists them)',
  '  2  config error',
  '',
].join('\n');

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let remote: string | undefined;
  let remoteTipRef: string | undefined;
  let repoRootOverride: string | undefined;
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--remote' || flag === '--remote-tip-ref' || flag === '--repo-root') {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      if (flag === '--remote') remote = value;
      else if (flag === '--remote-tip-ref') remoteTipRef = value;
      else if (flag === '--repo-root') repoRootOverride = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag ?? '(undefined)'}` };
  }
  if (help) {
    return { ok: true, opts: { help: true } };
  }
  const opts: CoverageCliOptions = {
    ...(remote !== undefined ? { remote } : {}),
    ...(remoteTipRef !== undefined ? { remoteTipRef } : {}),
    ...(repoRootOverride !== undefined ? { repoRoot: repoRootOverride } : {}),
  };
  return { ok: true, opts };
}

function gitCurrentBranch(repoRoot: string): string | null {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function resolveCommits(repoRoot: string, range: string): UnpushedCommit[] {
  try {
    const out = execFileSync(
      'git',
      ['log', '--reverse', '--format=%H%x09%P%x09%s', range],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return out
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((line) => {
        const [sha, parents, subject] = line.split('\t');
        const parentSha = (parents ?? '').trim().split(/\s+/)[0] ?? '';
        return { sha: sha ?? '', parentSha, subject: subject ?? '' };
      });
  } catch {
    return [];
  }
}

async function defaultIsScopeDiscoveryOptedIn(repoRoot: string): Promise<boolean> {
  try {
    const s = await stat(join(repoRoot, '.dw-lifecycle', 'scope-discovery'));
    return s.isDirectory();
  } catch {
    return false;
  }
}

function summarize(result: CheckImplementHookCoverageResult): string {
  switch (result.kind) {
    case 'allow-not-opted-in':
    case 'allow-no-unpushed-commits':
    case 'allow-no-prior-run':
    case 'allow-all-commits-backed':
      return `check-implement-hook-coverage: ${result.reason}`;
    case 'refuse-uncovered-commits': {
      const lines = [
        `check-implement-hook-coverage: REFUSED. ${result.cure}`,
        'Uncovered commits:',
        ...result.uncovered.map((u) => `  ${u.sha.slice(0, 12)}  parent=${u.parentSha.slice(0, 8)}  ${u.subject}`),
      ];
      return lines.join('\n');
    }
  }
}

export interface RunArgs {
  readonly opts: CoverageCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly stderr: NodeJS.WriteStream | NodeJS.WritableStream;
}

export async function runCheckImplementHookCoverage(args: RunArgs): Promise<number> {
  const repoRootResolved = args.opts.repoRoot ?? args.projectRoot;
  const remote = args.opts.remote ?? 'origin';
  let tipRef = args.opts.remoteTipRef;
  if (tipRef === undefined) {
    const branch = gitCurrentBranch(repoRootResolved);
    if (branch === null) {
      args.stderr.write(
        'check-implement-hook-coverage: cannot determine current branch (detached HEAD?); pass --remote-tip-ref.\n',
      );
      return 2;
    }
    tipRef = `${remote}/${branch}`;
  }
  const range = `${tipRef}..HEAD`;
  const result = await checkImplementHookCoverage({
    resolveUnpushedCommits: async () => resolveCommits(repoRootResolved, range),
    readLog: () => readHookRunLog(repoRootResolved),
    isScopeDiscoveryOptedIn: () => defaultIsScopeDiscoveryOptedIn(repoRootResolved),
    hasBootstrapSentinel: () => hasBootstrapSentinel(repoRootResolved),
  });
  args.stderr.write(`${summarize(result)}\n`);
  if (result.kind.startsWith('allow')) return 0;
  return 1;
}

export async function checkImplementHookCoverageCli(rawArgs: string[]): Promise<void> {
  const parsed = parseFlags(rawArgs);
  if (parsed.ok && parsed.opts.help === true) {
    process.stdout.write(USAGE);
    return;
  }
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}`);
    process.exit(2);
  }
  let projectRoot: string;
  if (parsed.opts.repoRoot !== undefined) {
    projectRoot = isAbsolute(parsed.opts.repoRoot)
      ? parsed.opts.repoRoot
      : resolve(process.cwd(), parsed.opts.repoRoot);
  } else {
    projectRoot = repoRoot();
  }
  const exit = await runCheckImplementHookCoverage({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(exit);
}
