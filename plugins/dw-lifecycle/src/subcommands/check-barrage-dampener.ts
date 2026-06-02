/**
 * plugins/dw-lifecycle/src/subcommands/check-barrage-dampener.ts
 *
 * Phase 15 Task 7 — CLI shim for the audit-barrage dampener.
 *
 *   dw-lifecycle check-barrage-dampener
 *     --feature <slug>
 *     [--threshold <N>]      default: 2
 *     [--repo-root <path>]
 *     [--help]
 *
 * Exit codes:
 *   0 — fire the hook (not dampened: not enough quiet runs yet, OR
 *       most recent runs have HIGH+ findings).
 *   1 — SKIP the hook (dampened: last N runs all quiet).
 *   2 — config error (missing flag, feature not found).
 *
 * The /dwi end-of-task hook's bash recipe gates the audit-barrage
 * fire on this verb. See plugins/dw-lifecycle/skills/implement/SKILL.md
 * Step 6 for the canonical recipe shape.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';
import { checkBarrageDampener } from '../scope-discovery/promote-findings/check-barrage-dampener.js';

export interface CheckBarrageDampenerCliOptions {
  readonly featureSlug: string;
  readonly threshold: number;
  readonly repoRoot?: string;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: CheckBarrageDampenerCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle check-barrage-dampener',
  '    --feature <slug>',
  '    [--threshold <N>]',
  '    [--repo-root <path>]',
  '    [--help]',
  '',
  '--feature <slug>     Required. Resolves the audit-log at',
  '                     docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md.',
  '--threshold <N>      Number of consecutive most-recent runs that must',
  '                     all have 0 HIGH+ findings to dampen. Default: 2.',
  '--repo-root <path>   Project root. Default: cwd.',
  '',
  'Exit codes:',
  '  0  fire the hook (not dampened)',
  '  1  SKIP the hook (dampened — last N runs quiet)',
  '  2  config error (missing flag, feature not found)',
  '',
].join('\n');

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let featureSlug: string | undefined;
  let threshold = 2;
  let repoRootOverride: string | undefined;
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--feature' || flag === '--threshold' || flag === '--repo-root') {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--threshold') {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return { ok: false, error: `--threshold must be a positive integer (got '${value}')` };
        }
        threshold = parsed;
      } else if (flag === '--repo-root') repoRootOverride = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag ?? '(undefined)'}` };
  }
  if (help) {
    return { ok: true, opts: { featureSlug: featureSlug ?? '', threshold, help: true } };
  }
  if (featureSlug === undefined) {
    return { ok: false, error: '--feature <slug> is required' };
  }
  const opts: CheckBarrageDampenerCliOptions = {
    featureSlug,
    threshold,
    ...(repoRootOverride !== undefined ? { repoRoot: repoRootOverride } : {}),
  };
  return { ok: true, opts };
}

export interface RunArgs {
  readonly opts: CheckBarrageDampenerCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly stderr: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly read?: (path: string) => Promise<string>;
}

export async function runCheckBarrageDampener(args: RunArgs): Promise<number> {
  const repoRootResolved = args.opts.repoRoot ?? args.projectRoot;
  const { root: featureRoot } = await resolveFeatureRoot({
    repoRoot: repoRootResolved,
    slug: args.opts.featureSlug,
  });
  if (featureRoot === undefined) {
    args.stderr.write(
      `check-barrage-dampener: feature '${args.opts.featureSlug}' not found under docs/*/001-IN-PROGRESS/.\n`,
    );
    return 2;
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  if (!existsSync(auditLogPath)) {
    args.stderr.write(`check-barrage-dampener: audit-log not found at ${auditLogPath}.\n`);
    return 2;
  }
  const reader = args.read ?? ((p: string) => readFile(p, 'utf8'));
  const auditLogText = await reader(auditLogPath);
  const result = checkBarrageDampener({
    auditLogText,
    threshold: args.opts.threshold,
  });
  args.stderr.write(`check-barrage-dampener: ${result.reason}\n`);
  if (result.recentRunCounts.length > 0) {
    for (const r of result.recentRunCounts) {
      args.stderr.write(
        `  ${r.runDirBasename}: ${r.highPlusCount} HIGH+ / ${r.totalFindings} total\n`,
      );
    }
  }
  return result.dampened ? 1 : 0;
}

export async function checkBarrageDampenerCli(rawArgs: string[]): Promise<void> {
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
  const exit = await runCheckBarrageDampener({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(exit);
}
