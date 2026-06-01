/**
 * plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts
 *
 * Phase 16 Task 3 — CLI shim for the `check-barrage-tip` verb. The
 * new-diff guard for the audit-barrage hook (#383).
 *
 *   dw-lifecycle check-barrage-tip
 *     --feature <slug>
 *     [--repo-root <path>]
 *     [--help]
 *
 * Exit codes:
 *   0 — new diff exists since the most-recent barrage's tip.sha (or no
 *       prior barrage / missing tip.sha; fail-safe to fire).
 *   1 — no new diff; the audit-barrage hook should skip.
 *   2 — config error (missing flag, feature not found).
 *
 * Bash composition example:
 *
 *   if dw-lifecycle check-barrage-tip --feature <slug>; then
 *     # new diff exists; fire the audit-barrage hook
 *   else
 *     # no new diff; skip
 *   fi
 */

import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';
import { checkBarrageTip } from '../scope-discovery/promote-findings/check-barrage-tip.js';

export interface CheckBarrageTipCliOptions {
  readonly featureSlug: string;
  readonly repoRoot?: string;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: CheckBarrageTipCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle check-barrage-tip',
  '    --feature <slug>',
  '    [--repo-root <path>]',
  '    [--help]',
  '',
  '--feature <slug>   Required.',
  '--repo-root <path> Project root. Default: cwd.',
  '',
  'Exit codes:',
  '  0  new diff exists; the audit-barrage hook should fire',
  '  1  no new diff since last barrage; skip',
  '  2  config error',
  '',
].join('\n');

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let featureSlug: string | undefined;
  let repoRootOverride: string | undefined;
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--feature' || flag === '--repo-root') {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--repo-root') repoRootOverride = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag ?? '(undefined)'}` };
  }
  if (help) {
    return { ok: true, opts: { featureSlug: featureSlug ?? '', help: true } };
  }
  if (featureSlug === undefined) {
    return { ok: false, error: '--feature <slug> is required' };
  }
  const opts: CheckBarrageTipCliOptions = {
    featureSlug,
    ...(repoRootOverride !== undefined ? { repoRoot: repoRootOverride } : {}),
  };
  return { ok: true, opts };
}

export interface RunArgs {
  readonly opts: CheckBarrageTipCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly stderr: NodeJS.WriteStream | NodeJS.WritableStream;
  /** Injectable for tests; defaults to fs.promises.readdir filtered to dirs. */
  readonly listRunDirs?: (auditRunsDir: string) => Promise<string[]>;
  /** Injectable for tests; defaults to reading `<runDir>/tip.sha`. */
  readonly readTipSha?: (runDir: string) => Promise<string | null>;
  /** Injectable for tests; defaults to git rev-list --count, bound to projectRoot. */
  readonly gitRevListCount?: (range: string) => Promise<number>;
}

async function defaultListRunDirs(auditRunsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(auditRunsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => join(auditRunsDir, e.name));
  } catch {
    return [];
  }
}

async function defaultReadTipSha(runDir: string): Promise<string | null> {
  try {
    const text = await readFile(join(runDir, 'tip.sha'), 'utf8');
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function defaultGitRevListCount(range: string, cwd: string): Promise<number> {
  return Promise.resolve(
    (() => {
      try {
        const stdout = execFileSync('git', ['rev-list', '--count', range], {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const n = Number.parseInt(stdout.trim(), 10);
        return Number.isFinite(n) ? n : 0;
      } catch {
        // If the tip sha doesn't exist (e.g., the run-dir's tip.sha is
        // stale after a force-push or branch rebase), treat as new-diff
        // → fire. The fail-safe everywhere is fire, not skip.
        return Number.MAX_SAFE_INTEGER;
      }
    })(),
  );
}

export async function runCheckBarrageTip(args: RunArgs): Promise<number> {
  const repoRootResolved = args.opts.repoRoot ?? args.projectRoot;
  const { root: featureRoot } = await resolveFeatureRoot({
    repoRoot: repoRootResolved,
    slug: args.opts.featureSlug,
  });
  if (featureRoot === undefined) {
    args.stderr.write(
      `check-barrage-tip: feature '${args.opts.featureSlug}' not found under docs/*/001-IN-PROGRESS/.\n`,
    );
    return 2;
  }
  const auditRunsDir = join(
    repoRootResolved,
    '.dw-lifecycle',
    'scope-discovery',
    'audit-runs',
  );
  const listRunDirs = args.listRunDirs ?? defaultListRunDirs;
  const readTipSha = args.readTipSha ?? defaultReadTipSha;
  const gitRevListCount =
    args.gitRevListCount ?? ((range: string) => defaultGitRevListCount(range, repoRootResolved));
  const result = await checkBarrageTip({
    auditRunsDir,
    listRunDirs,
    readTipSha,
    gitRevListCount,
  });
  args.stderr.write(`check-barrage-tip: ${result.reason}\n`);
  return result.hasNewDiff ? 0 : 1;
}

export async function checkBarrageTipCli(rawArgs: string[]): Promise<void> {
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
  const exit = await runCheckBarrageTip({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(exit);
}
