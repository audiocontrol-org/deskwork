/**
 * plugins/dw-lifecycle/src/subcommands/check-open-findings.ts
 *
 * CLI verb the `/dw-lifecycle:implement` skill invokes at task-pickup
 * time. Wraps the pure `checkOpenFindings` library in argv parsing and
 * exit-code semantics:
 *
 *   exit 0 — zero open findings on the feature; proceed.
 *   exit 1 — ≥1 open findings; refusal message names every finding ID
 *            and points at `/dw-lifecycle:promote-findings` as the cure.
 *            The skill stops here per Phase 13's anti-deferral discipline.
 *   exit 2 — config-level failure (feature root not found, unknown flag,
 *            missing --feature). Operator action needed; the gate's
 *            verdict is undefined in this state.
 *
 * Per workplan Phase 13 Task 2: no `--ignore-open-findings` flag in v1.
 * Operator decision was to err on rigidity; revisit if unworkable.
 */

import { isAbsolute, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import {
  checkOpenFindings,
  FeatureRootNotFoundError,
  type OpenFindingsGateResult,
} from '../scope-discovery/promote-findings/open-findings-gate.js';

export interface CheckOpenFindingsCliOptions {
  readonly featureSlug: string;
  readonly repoRoot?: string;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: CheckOpenFindingsCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle check-open-findings',
  '    --feature <slug>',
  '    [--repo-root <path>]',
  '    [--help]',
  '',
  '--feature <slug>      The feature slug. Resolves the audit-log at',
  '                      docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md.',
  '--repo-root <path>    Project root. Default: nearest git toplevel.',
  '',
  'Exit codes:',
  '  0  zero open findings; proceed',
  '  1  one or more Status: open findings; refusal message names them all',
  '  2  config error (feature not found, missing --feature, unknown flag)',
  '',
].join('\n');

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let featureSlug: string | undefined;
  let repoRootOverride: string | undefined;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--feature') {
      const value = argv[++i];
      if (value === undefined) {
        return { ok: false, error: '--feature requires a value' };
      }
      featureSlug = value;
      continue;
    }
    if (flag === '--repo-root') {
      const value = argv[++i];
      if (value === undefined) {
        return { ok: false, error: '--repo-root requires a value' };
      }
      repoRootOverride = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag ?? '(undefined)'}` };
  }
  if (help) {
    return { ok: true, opts: { help: true, featureSlug: featureSlug ?? '' } };
  }
  if (featureSlug === undefined) {
    return { ok: false, error: '--feature <slug> is required' };
  }
  const opts: CheckOpenFindingsCliOptions =
    repoRootOverride === undefined
      ? { featureSlug }
      : { featureSlug, repoRoot: repoRootOverride };
  return { ok: true, opts };
}

export interface RunArgs {
  readonly opts: CheckOpenFindingsCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
}

function renderRefusal(
  featureSlug: string,
  openFindings: OpenFindingsGateResult & { allowed: false },
): string {
  const ids = openFindings.openFindings.map((f) => f.findingId).join(', ');
  const n = openFindings.openFindings.length;
  return [
    `Cannot advance: feature ${featureSlug} has ${n} open audit finding${n === 1 ? '' : 's'} (${ids}).`,
    `Open findings block task pickup per project rule "broken implementation is not done."`,
    `Run \`/dw-lifecycle:promote-findings --feature ${featureSlug}\` to scope into workplan before continuing.`,
    '',
  ].join('\n');
}

export async function runCheckOpenFindings(args: RunArgs): Promise<number> {
  const repoRootResolved = args.opts.repoRoot ?? args.projectRoot;
  let result: OpenFindingsGateResult;
  try {
    result = await checkOpenFindings({
      featureSlug: args.opts.featureSlug,
      repoRoot: repoRootResolved,
    });
  } catch (err) {
    if (err instanceof FeatureRootNotFoundError) {
      args.stderr.write(
        `check-open-findings: feature '${args.opts.featureSlug}' not found under docs/*/001-IN-PROGRESS/. Searched: ${err.searched.join(', ')}\n`,
      );
      return 2;
    }
    throw err;
  }
  if (result.allowed) {
    args.stderr.write(
      `check-open-findings: feature '${args.opts.featureSlug}' has zero open findings; proceed.\n`,
    );
    return 0;
  }
  args.stderr.write(renderRefusal(args.opts.featureSlug, result));
  return 1;
}

export async function checkOpenFindingsCli(rawArgs: string[]): Promise<void> {
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
  const exit = await runCheckOpenFindings({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (exit !== 0) process.exit(exit);
}
