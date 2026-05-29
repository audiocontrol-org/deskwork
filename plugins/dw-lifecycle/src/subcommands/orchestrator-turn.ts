/**
 * plugins/dw-lifecycle/src/subcommands/orchestrator-turn.ts
 *
 * CLI shim for the orchestrator-loop's per-turn audit/judge stack.
 *
 * Emits a TurnReport to stdout as JSON; a single-line summary to stderr
 * (suppressed with --json). The shim handles flag parsing + dispatch
 * to the runOrchestratorTurnCli assembler.
 *
 * Exit codes mirror the assembler:
 *   0 — success.
 *   1 — infra error.
 *   2 — usage error (missing --feature, unknown flag, feature not found, etc.).
 */

import {
  runOrchestratorTurnCli,
  type OrchestratorTurnCliArgs,
} from '../scope-discovery/orchestrator-turn.js';

const USAGE = [
  'Usage: dw-lifecycle orchestrator-turn',
  '    --feature <slug>',
  '    [--slug <slug>]',
  '    [--repo-root <path>]',
  '    [--audit-log <path>]',
  '    [--skip-judge]',
  '    [--skip-auditor]',
  '    [--judge-input <path>]',
  '    [--auditor-input <path>]',
  '    [--runtime-dir <path>]',
  '    [--allow-missing-feature]',
  '    [--json]',
  '    [--help]',
  '',
  '--feature <slug>          The feature directory slug, matching the directory',
  '                          name under \`docs/<v>/001-IN-PROGRESS/<slug>/\`.',
  '                          Example: \`--feature scope-discovery\` resolves to',
  '                          \`docs/1.0/001-IN-PROGRESS/scope-discovery/\`.',
  '--slug <slug>             Alias for --feature; aligns with',
  '                          \`dw-lifecycle scope-inventory --slug\`.',
  '--allow-missing-feature   Skip the "feature directory must exist" pre-flight',
  '                          check. Use only for test fixtures or adopter',
  '                          projects that do not use the standard layout.',
  '--verbose                 Force the "NOTE: only N/6 catalog files present"',
  '                          summary decoration even when the count is unchanged',
  '                          from the prior turn. Default false (quiet on steady',
  '                          state; emit on first turn or when count changes).',
  '',
  'Runs one orchestrator turn (audit-log read + wrong-decision detection',
  '+ mediation clustering + controller decision + escalation visibility).',
  'Emits a TurnReport to stdout as JSON; a single-line summary to stderr',
  '(suppressed with --json). See plugins/dw-lifecycle/src/scope-discovery/',
  'orchestrator-loop/loop-types.ts for the TurnReport schema.',
  '',
].join('\n');

export interface ParsedArgs {
  readonly cli: OrchestratorTurnCliArgs;
  readonly emitStderrSummary: boolean;
}

export interface ParseResult {
  readonly ok: boolean;
  readonly args?: ParsedArgs;
  readonly help?: boolean;
  readonly error?: string;
}

/**
 * Exported for tests. The shim itself calls this; the export lets test
 * code exercise flag parsing without touching \`process.exit\`.
 */
export function parseFlags(argv: ReadonlyArray<string>): ParseResult {
  let featureSlug: string | undefined;
  let slugAlias: string | undefined;
  let repoRoot: string | undefined;
  let auditLogPath: string | undefined;
  let skipJudge = false;
  let skipAuditor = false;
  let judgeInputPath: string | undefined;
  let auditorInputPath: string | undefined;
  let runtimeDirOverride: string | undefined;
  let allowMissingFeature = false;
  let jsonOnly = false;
  let verbose = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      return { ok: true, help: true };
    }
    if (flag === '--skip-judge') { skipJudge = true; continue; }
    if (flag === '--skip-auditor') { skipAuditor = true; continue; }
    if (flag === '--allow-missing-feature') { allowMissingFeature = true; continue; }
    if (flag === '--json') { jsonOnly = true; continue; }
    if (flag === '--verbose') { verbose = true; continue; }
    if (
      flag === '--feature' ||
      flag === '--slug' ||
      flag === '--repo-root' ||
      flag === '--audit-log' ||
      flag === '--judge-input' ||
      flag === '--auditor-input' ||
      flag === '--runtime-dir'
    ) {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--slug') slugAlias = value;
      else if (flag === '--repo-root') repoRoot = value;
      else if (flag === '--audit-log') auditLogPath = value;
      else if (flag === '--judge-input') judgeInputPath = value;
      else if (flag === '--auditor-input') auditorInputPath = value;
      else if (flag === '--runtime-dir') runtimeDirOverride = value;
      continue;
    }
    return { ok: false, error: `unknown arg: ${flag ?? '(empty)'}` };
  }

  // TF-013 — --slug is an alias for --feature.
  let resolvedSlug: string | undefined;
  if (featureSlug !== undefined && slugAlias !== undefined) {
    if (featureSlug !== slugAlias) {
      return {
        ok: false,
        error: '--feature and --slug supplied with different values; choose one',
      };
    }
    resolvedSlug = featureSlug;
  } else if (featureSlug !== undefined) {
    resolvedSlug = featureSlug;
  } else if (slugAlias !== undefined) {
    resolvedSlug = slugAlias;
  }

  if (resolvedSlug === undefined) {
    return { ok: false, error: '--feature <slug> is required' };
  }

  const cli: OrchestratorTurnCliArgs = {
    repoRoot: repoRoot ?? process.cwd(),
    featureSlug: resolvedSlug,
    ...(auditLogPath !== undefined ? { auditLogPath } : {}),
    skipJudge,
    skipAuditor,
    ...(judgeInputPath !== undefined ? { judgeInputPath } : {}),
    ...(auditorInputPath !== undefined ? { auditorInputPath } : {}),
    ...(runtimeDirOverride !== undefined ? { runtimeDirOverride } : {}),
    allowMissingFeature,
    verbose,
  };
  return {
    ok: true,
    args: { cli, emitStderrSummary: !jsonOnly },
  };
}

export async function orchestratorTurn(args: string[]): Promise<void> {
  const parsed = parseFlags(args);
  if (parsed.help === true) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (!parsed.ok || parsed.args === undefined) {
    process.stderr.write(`orchestrator-turn: ${parsed.error ?? 'parse error'}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }

  const result = await runOrchestratorTurnCli(parsed.args.cli);
  if (result.exitCode !== 0 || result.report === undefined) {
    if (result.errorText !== undefined) {
      process.stderr.write(`${result.errorText}\n`);
    }
    process.exit(result.exitCode);
  }

  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  if (parsed.args.emitStderrSummary) {
    process.stderr.write(`orchestrator-turn: ${result.report.summary}\n`);
  }
  process.exit(0);
}
