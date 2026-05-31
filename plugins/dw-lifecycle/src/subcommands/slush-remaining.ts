/**
 * plugins/dw-lifecycle/src/subcommands/slush-remaining.ts
 *
 * Phase 15 Task 7 — CLI shim for the `slush-remaining` verb.
 *
 *   dw-lifecycle slush-remaining
 *     --feature <slug>
 *     [--threshold <N>]      default: 2
 *     [--slush-date <YYYY-MM-DD>]  default: today UTC
 *     [--scope latest|all]   default: latest (per Issue #380)
 *     [--repo-root <path>]
 *     [--apply]              default is dry-run
 *     [--help]
 *
 * Exit codes:
 *   0 — slush proposed (dry-run) or applied; OR dampener not engaged
 *       (no-op, reported to stderr).
 *   2 — config error (missing flag, feature not found).
 *
 * Bakes the operator's directive ("address all findings; bin smaller
 * items into the slush pile when 2 consecutive audits had 0 HIGH
 * issues") into the /dwi loop. The implement-skill Step 6 invokes
 * this verb when the dampener engages.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';
import { slushRemaining } from '../scope-discovery/promote-findings/slush-remaining.js';
import { atomicWriteFile } from '../scope-discovery/util/atomic-write-file.js';

export interface SlushRemainingCliOptions {
  readonly featureSlug: string;
  readonly threshold: number;
  readonly slushDate?: string;
  readonly scope: 'latest' | 'all';
  readonly repoRoot?: string;
  readonly apply: boolean;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: SlushRemainingCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle slush-remaining',
  '    --feature <slug>',
  '    [--threshold <N>]',
  '    [--slush-date <YYYY-MM-DD>]',
  '    [--scope latest|all]',
  '    [--repo-root <path>]',
  '    [--apply]',
  '    [--help]',
  '',
  '--feature <slug>          Required.',
  '--threshold <N>           Dampener threshold (must match the gate). Default: 2.',
  '--slush-date <YYYY-MM-DD> Date stamp for the `acknowledged-slush-pile-<date>`',
  '                          status suffix. Default: today UTC.',
  '--scope latest|all        Restrict slush to the most-recent barrage section',
  '                          (default) or every barrage section. Per Issue #380.',
  '--repo-root <path>        Project root. Default: cwd.',
  '--apply                   Write the flips. Default is dry-run.',
  '',
  'Exit codes:',
  '  0  slush proposed/applied OR dampener not engaged (no-op)',
  '  2  config error',
  '',
].join('\n');

function todayISO(now: Date = new Date()): string {
  const y = now.getUTCFullYear().toString().padStart(4, '0');
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = now.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let featureSlug: string | undefined;
  let threshold = 2;
  let slushDate: string | undefined;
  let scope: 'latest' | 'all' = 'latest';
  let repoRootOverride: string | undefined;
  let apply = false;
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--apply') {
      apply = true;
      continue;
    }
    if (
      flag === '--feature' ||
      flag === '--threshold' ||
      flag === '--slush-date' ||
      flag === '--scope' ||
      flag === '--repo-root'
    ) {
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
      } else if (flag === '--slush-date') slushDate = value;
      else if (flag === '--scope') {
        if (value !== 'latest' && value !== 'all') {
          return { ok: false, error: `--scope must be 'latest' or 'all' (got '${value}')` };
        }
        scope = value;
      } else if (flag === '--repo-root') repoRootOverride = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag ?? '(undefined)'}` };
  }
  if (help) {
    return {
      ok: true,
      opts: { featureSlug: featureSlug ?? '', threshold, scope, apply, help: true },
    };
  }
  if (featureSlug === undefined) {
    return { ok: false, error: '--feature <slug> is required' };
  }
  const opts: SlushRemainingCliOptions = {
    featureSlug,
    threshold,
    scope,
    apply,
    ...(slushDate !== undefined ? { slushDate } : {}),
    ...(repoRootOverride !== undefined ? { repoRoot: repoRootOverride } : {}),
  };
  return { ok: true, opts };
}

export interface RunArgs {
  readonly opts: SlushRemainingCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly stderr: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly read?: (path: string) => Promise<string>;
  readonly write?: (path: string, content: string) => Promise<void>;
}

export async function runSlushRemaining(args: RunArgs): Promise<number> {
  const repoRootResolved = args.opts.repoRoot ?? args.projectRoot;
  const { root: featureRoot } = await resolveFeatureRoot({
    repoRoot: repoRootResolved,
    slug: args.opts.featureSlug,
  });
  if (featureRoot === undefined) {
    args.stderr.write(
      `slush-remaining: feature '${args.opts.featureSlug}' not found under docs/*/001-IN-PROGRESS/.\n`,
    );
    return 2;
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  const workplanPath = join(featureRoot, 'workplan.md');
  if (!existsSync(auditLogPath)) {
    args.stderr.write(`slush-remaining: audit-log not found at ${auditLogPath}.\n`);
    return 2;
  }
  if (!existsSync(workplanPath)) {
    args.stderr.write(`slush-remaining: workplan not found at ${workplanPath}.\n`);
    return 2;
  }
  const reader = args.read ?? ((p: string) => readFile(p, 'utf8'));
  const writer = args.write ?? atomicWriteFile;
  const auditLogText = await reader(auditLogPath);
  const workplanText = await reader(workplanPath);
  const slushDate = args.opts.slushDate ?? todayISO();
  const result = slushRemaining({
    auditLogText,
    workplanText,
    slushDate,
    threshold: args.opts.threshold,
    scope: args.opts.scope,
  });
  if (!result.dampenerEngaged) {
    args.stderr.write(
      `slush-remaining: dampener not engaged — refusing to slush.\n  ${result.dampenerReason}\n`,
    );
    return 0;
  }
  args.stderr.write(
    `slush-remaining: dampener engaged. ` +
      `flipped: ${result.flips.length}, ` +
      `skipped: ${result.skippedHighs.length} HIGH${result.skippedHighs.length === 1 ? '' : 's'} ` +
      `(left open as guardrails)\n`,
  );
  for (const flip of result.flips) {
    args.stdout.write(
      `  ${flip.findingId} → acknowledged-slush-pile-${slushDate}` +
        (flip.workplanTaskFlipped ? ' (workplan task boxes flipped)' : ' (no workplan task found)') +
        '\n',
    );
  }
  for (const skipped of result.skippedHighs) {
    args.stdout.write(
      `  ${skipped.findingId} (severity=${skipped.severity ?? 'unknown'}) — preserved as Status: open\n`,
    );
  }
  if (!args.opts.apply) {
    args.stderr.write('slush-remaining: dry-run (re-run with --apply to write).\n');
    return 0;
  }
  if (result.flips.length > 0) {
    await writer(auditLogPath, result.newAuditLogText);
    await writer(workplanPath, result.newWorkplanText);
    args.stderr.write(
      `slush-remaining: wrote ${result.flips.length} flip(s) to audit-log + workplan.\n`,
    );
  }
  return 0;
}

export async function slushRemainingCli(rawArgs: string[]): Promise<void> {
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
  const exit = await runSlushRemaining({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(exit);
}
