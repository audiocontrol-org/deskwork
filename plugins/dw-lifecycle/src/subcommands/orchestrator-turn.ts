/**
 * plugins/dw-lifecycle/src/subcommands/orchestrator-turn.ts
 *
 * CLI shim for the orchestrator-loop's per-turn audit/judge stack.
 *
 * The `/dw-lifecycle:implement` skill dispatches into dw-lifecycle via
 * Bash, so the orchestrator-loop's TypeScript library needs a CLI verb
 * to be reachable. This shim parses flags, calls `runOrchestratorTurnCli`,
 * and emits:
 *
 *   - stdout: machine-readable JSON `TurnReport` (the agent parses this).
 *   - stderr: one-line human summary (the agent surfaces this in the
 *     per-task report); suppressed with `--json`.
 *
 * Exit codes mirror the assembler:
 *   0 — success.
 *   1 — infra error (catalog parse / discovery-agent / loop / persist).
 *   2 — usage error (missing --feature, unknown flag, etc.).
 */

import {
  runOrchestratorTurnCli,
  type OrchestratorTurnCliArgs,
} from '../scope-discovery/orchestrator-turn.js';

const USAGE = [
  'Usage: dw-lifecycle orchestrator-turn',
  '    --feature <slug>',
  '    [--repo-root <path>]',
  '    [--audit-log <path>]',
  '    [--skip-judge]',
  '    [--skip-auditor]',
  '    [--judge-input <path>]',
  '    [--auditor-input <path>]',
  '    [--runtime-dir <path>]',
  '    [--json]',
  '    [--help]',
  '',
  'Runs one orchestrator turn (audit-log read + wrong-decision detection',
  '+ mediation clustering + controller decision + escalation visibility).',
  'Emits a TurnReport to stdout as JSON; a single-line summary to stderr',
  '(suppressed with --json). See plugins/dw-lifecycle/src/scope-discovery/',
  'orchestrator-loop/loop-types.ts for the TurnReport schema.',
  '',
].join('\n');

interface ParsedArgs {
  readonly cli: OrchestratorTurnCliArgs;
  readonly emitStderrSummary: boolean;
}

interface ParseResult {
  readonly ok: boolean;
  readonly args?: ParsedArgs;
  readonly help?: boolean;
  readonly error?: string;
}

function parseFlags(argv: ReadonlyArray<string>): ParseResult {
  let featureSlug: string | undefined;
  let repoRoot: string | undefined;
  let auditLogPath: string | undefined;
  let skipJudge = false;
  let skipAuditor = false;
  let judgeInputPath: string | undefined;
  let auditorInputPath: string | undefined;
  let runtimeDirOverride: string | undefined;
  let jsonOnly = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      return { ok: true, help: true };
    }
    if (flag === '--skip-judge') {
      skipJudge = true;
      continue;
    }
    if (flag === '--skip-auditor') {
      skipAuditor = true;
      continue;
    }
    if (flag === '--json') {
      jsonOnly = true;
      continue;
    }
    if (
      flag === '--feature' ||
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
      else if (flag === '--repo-root') repoRoot = value;
      else if (flag === '--audit-log') auditLogPath = value;
      else if (flag === '--judge-input') judgeInputPath = value;
      else if (flag === '--auditor-input') auditorInputPath = value;
      else if (flag === '--runtime-dir') runtimeDirOverride = value;
      continue;
    }
    return { ok: false, error: `unknown arg: ${flag ?? '(empty)'}` };
  }

  if (featureSlug === undefined) {
    return { ok: false, error: '--feature <slug> is required' };
  }

  const cli: OrchestratorTurnCliArgs = {
    repoRoot: repoRoot ?? process.cwd(),
    featureSlug,
    ...(auditLogPath !== undefined ? { auditLogPath } : {}),
    skipJudge,
    skipAuditor,
    ...(judgeInputPath !== undefined ? { judgeInputPath } : {}),
    ...(auditorInputPath !== undefined ? { auditorInputPath } : {}),
    ...(runtimeDirOverride !== undefined ? { runtimeDirOverride } : {}),
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

  // Stable JSON: stringify with 2-space indent + trailing newline.
  // The agent's JSON parser doesn't care about key ordering; the
  // 2-space indent makes the output human-skimmable in terminals.
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  if (parsed.args.emitStderrSummary) {
    process.stderr.write(`orchestrator-turn: ${result.report.summary}\n`);
  }
  process.exit(0);
}
