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
import {
  checkBarrageTip,
  type BarrageTipCheckResult,
} from '../scope-discovery/promote-findings/check-barrage-tip.js';

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
  /** Injectable for tests; defaults to `git diff --name-only <range>` against projectRoot. */
  readonly listDiffFiles?: (range: string) => Promise<string[]>;
}

/**
 * Per AUDIT-20260601-07 (claude-02): shared type guard replaces the
 * scattered `as NodeJS.ErrnoException` casts. Narrows `unknown` to
 * `ErrnoException` shape without crossing the project's "no `as
 * Type`" rule.
 */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error;
}

/**
 * Per AUDIT-20260531-23 (codex-03): distinguish ENOENT (directory
 * doesn't exist yet — legitimate boot case → return empty) from other
 * errors (EACCES, malformed scaffold → config error that the runner
 * surfaces as exit 2). Pre-fix, this swallowed ALL errors and returned
 * [], silently masking permission problems as "no prior runs."
 */
export async function defaultListRunDirs(auditRunsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(auditRunsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => join(auditRunsDir, e.name));
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      // Boot case: audit-runs/ doesn't exist yet. Return empty so the
      // library reports `hasNewDiff: true` (fail-safe to fire).
      return [];
    }
    // EACCES, ENOTDIR, EIO, etc. — re-throw so the runner can map to
    // exit-2 config error per the SKILL.md failure-path policy.
    throw err;
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

/**
 * Phase 18 Task 6 / AUDIT-30: default `listDiffFiles` invokes
 * `git diff --name-only <range>` and parses the result. On git
 * failure, returns the empty array — the library treats empty-files
 * as "no signal" and falls back to firing (fail-safe to audit).
 */
function defaultListDiffFiles(range: string, cwd: string): Promise<string[]> {
  return Promise.resolve(
    (() => {
      try {
        const stdout = execFileSync('git', ['diff', '--name-only', range], {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        return stdout
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
      } catch {
        return [];
      }
    })(),
  );
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
  const listDiffFiles =
    args.listDiffFiles ?? ((range: string) => defaultListDiffFiles(range, repoRootResolved));
  // Per AUDIT-20260601-07 (claude-02): typed binding for the result
  // (was a `let result;` evolving-any). Try/catch wraps the call so
  // injected-dependency throws map to exit-2 config errors.
  let result: BarrageTipCheckResult;
  try {
    result = await checkBarrageTip({
      auditRunsDir,
      listRunDirs,
      readTipSha,
      gitRevListCount,
      listDiffFiles,
    });
  } catch (err) {
    // Per AUDIT-20260531-23: errors propagate from injected
    // listRunDirs (config/permissions issues) OR readTipSha (malformed
    // sidecar) OR gitRevListCount (git missing / not a repo). Per
    // AUDIT-20260601-01 (claude-03): use a domain-neutral message so
    // operators don't get pointed at audit-runs/ when the error is
    // actually in git or the tip-sha file. Map to exit 2 in all cases
    // — these are all config/scaffold problems the loop should STOP on.
    // Per AUDIT-20260601-07: use the shared isErrnoException type
    // guard rather than `as NodeJS.ErrnoException`.
    const code = isErrnoException(err) ? err.code ?? 'unknown' : 'unknown';
    const message = isErrnoException(err) ? err.message : String(err);
    args.stderr.write(
      `check-barrage-tip: error during barrage-tip check — ${code}: ${message}\n`,
    );
    return 2;
  }
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
