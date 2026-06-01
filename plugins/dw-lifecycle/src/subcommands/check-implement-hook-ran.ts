/**
 * plugins/dw-lifecycle/src/subcommands/check-implement-hook-ran.ts
 *
 * Phase 17 Task 4 — CLI shim for the commit-msg gate.
 *
 *   dw-lifecycle check-implement-hook-ran
 *     [--repo-root <path>]
 *     [--help]
 *
 * Exit codes:
 *   0 — allow this commit (marker matches HEAD, OR project not opted in,
 *       OR first commit after opt-in).
 *   1 — refuse the commit (marker missing or stale). Stderr names the
 *       cure verb verbatim.
 *   2 — config error (argv).
 *
 * Wired into the project's commit-msg hook chain alongside
 * `check-fix-task-tdd`. The two gates compose: TDD enforces "fix-task
 * commits cite a passing test"; this gate enforces "all commits had
 * a hook run on the parent."
 */

import { execFileSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import {
  readHookRunMarker,
  type HookRunMarker,
} from '../scope-discovery/promote-findings/hook-run-marker.js';
import { readHookRunLog } from '../scope-discovery/promote-findings/hook-run-log.js';
import {
  checkImplementHookRan,
  type CheckImplementHookRanResult,
} from '../scope-discovery/promote-findings/check-implement-hook-ran.js';

export interface CheckImplementHookRanCliOptions {
  readonly repoRoot?: string;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: CheckImplementHookRanCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle check-implement-hook-ran',
  '    [--repo-root <path>]',
  '    [--help]',
  '',
  '--repo-root <path> Project root. Default: cwd.',
  '',
  'Exit codes:',
  '  0  allow this commit',
  '  1  refuse this commit (audit-barrage hook missing or stale)',
  '  2  config error',
  '',
].join('\n');

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let repoRootOverride: string | undefined;
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--repo-root') {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      repoRootOverride = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag ?? '(undefined)'}` };
  }
  if (help) {
    return { ok: true, opts: { help: true } };
  }
  const opts: CheckImplementHookRanCliOptions = {
    ...(repoRootOverride !== undefined ? { repoRoot: repoRootOverride } : {}),
  };
  return { ok: true, opts };
}

async function defaultIsScopeDiscoveryOptedIn(repoRoot: string): Promise<boolean> {
  try {
    const s = await stat(join(repoRoot, '.dw-lifecycle', 'scope-discovery'));
    return s.isDirectory();
  } catch {
    return false;
  }
}

function defaultGitHead(repoRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

export interface RunArgs {
  readonly opts: CheckImplementHookRanCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly stderr: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly readMarker?: () => Promise<HookRunMarker | null>;
  readonly gitHeadResolver?: () => Promise<string>;
  readonly isScopeDiscoveryOptedIn?: () => Promise<boolean>;
  readonly hasAnyPriorHookRun?: () => Promise<boolean>;
}

function summarize(result: CheckImplementHookRanResult): string {
  switch (result.kind) {
    case 'allow-not-opted-in':
    case 'allow-no-prior-run':
    case 'allow-marker-matches-head':
      return `check-implement-hook-ran: ${result.reason}`;
    case 'refuse-marker-missing':
    case 'refuse-marker-stale':
      return `check-implement-hook-ran: REFUSED. ${result.cure}`;
  }
}

export async function runCheckImplementHookRan(args: RunArgs): Promise<number> {
  const repoRootResolved = args.opts.repoRoot ?? args.projectRoot;
  const readMarker = args.readMarker ?? (() => readHookRunMarker({ repoRoot: repoRootResolved }));
  const gitHeadResolver = args.gitHeadResolver ?? (async () => defaultGitHead(repoRootResolved));
  const isScopeDiscoveryOptedIn =
    args.isScopeDiscoveryOptedIn ?? (() => defaultIsScopeDiscoveryOptedIn(repoRootResolved));
  const hasAnyPriorHookRun =
    args.hasAnyPriorHookRun ??
    (async () => {
      const log = await readHookRunLog(repoRootResolved);
      return log.length > 0;
    });
  const result = await checkImplementHookRan({
    repoRoot: repoRootResolved,
    readMarker,
    gitHeadResolver,
    isScopeDiscoveryOptedIn,
    hasAnyPriorHookRun,
  });
  args.stderr.write(`${summarize(result)}\n`);
  if (result.kind.startsWith('allow')) return 0;
  return 1;
}

export async function checkImplementHookRanCli(rawArgs: string[]): Promise<void> {
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
  const exit = await runCheckImplementHookRan({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(exit);
}
