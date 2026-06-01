/**
 * plugins/dw-lifecycle/src/subcommands/audit-barrage.ts
 *
 * CLI shim for the multi-model audit barrage. Parses flags, composes a
 * BarrageInput, dispatches `orchestrateBarrage`, then emits:
 *
 *   - stdout: BarrageRun as JSON (machine-readable; consumed by the
 *     skill's triage walk).
 *   - stderr: one-line summary unless `--quiet`.
 *
 * Exit code contract (per the audit-barrage PRD acceptance criteria):
 *
 *   0 — at least one model produced positive-byte stdout AND exit 0.
 *   1 — every model failed (spawn error, non-zero exit, OR zero bytes).
 *   2 — usage error (missing required flag, mutually-exclusive flags,
 *       unknown flag).
 *
 * # Model configuration is loaded from YAML
 *
 * The model battery is loaded by `loadAuditBarrageConfig(repoRoot)` —
 * project override at `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml`
 * takes precedence over the plugin's shipped default at
 * `plugins/dw-lifecycle/templates/audit-barrage-config.yaml`. See
 * `scope-discovery/audit-barrage/config-loader.ts` for the resolution
 * + validation rules.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadAuditBarrageConfig } from '../scope-discovery/audit-barrage/config-loader.js';
import { orchestrateBarrage } from '../scope-discovery/audit-barrage/orchestrate-barrage.js';
import {
  isModelRunHealthy,
  type BarrageInput,
  type BarrageResult,
  type BarrageRun,
  type ModelConfig,
  type ModelRunResult,
} from '../scope-discovery/audit-barrage/types.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';

const USAGE = [
  'Usage: dw-lifecycle audit-barrage',
  '    --feature <slug>',
  '    --prompt-file <path>',
  '    [--repo-root <path>]',
  '    [--models <comma-list>]',
  '    [--quiet]',
  '    [--output-run-dir]',
  '    [--help]',
  '',
  '--feature <slug>          The feature directory slug (e.g. `--feature',
  '                          scope-discovery`). Used in the run-dir name.',
  '--prompt-file <path>      Path to a file containing the audit prompt.',
  '                          Required — the prompt is the unit each CLI',
  '                          receives.',
  '--repo-root <path>        Defaults to cwd. The run dir lands under',
  '                          `<repo-root>/.dw-lifecycle/scope-discovery/',
  '                          audit-runs/<timestamp>-<feature>/`.',
  '--models <comma-list>     Comma-separated subset of the configured models.',
  '                          Defaults to every model in the loaded config.',
  '--quiet                   Suppress the stderr summary line.',
  '--output-run-dir          Print JUST the absolute run-dir path on stdout',
  '                          (BarrageRun JSON is suppressed). For bash',
  '                          composition in the /dw-lifecycle:implement',
  '                          end-of-task hook: RUN_DIR=$(dw-lifecycle',
  '                          audit-barrage --feature X --prompt-file Y',
  '                          --output-run-dir).',
  '',
  'Fires the selected CLIs in parallel, captures per-model output into',
  'the run dir, and emits a BarrageRun record as JSON on stdout.',
  '',
].join('\n');

/**
 * Parsed flag state. Exported for the test-side flag assertion paths.
 *
 * `modelNames` is `undefined` when the operator did not supply
 * `--models` — the verb then runs every configured model. When
 * supplied, it carries the operator's filter set in order; unknown
 * names are caught downstream against the loaded config.
 */
export interface ParsedFlags {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly promptFilePath: string;
  readonly modelNames: ReadonlyArray<string> | undefined;
  readonly quiet: boolean;
  readonly outputRunDir: boolean;
}

export interface ParseResult {
  readonly ok: boolean;
  readonly flags?: ParsedFlags;
  readonly help?: boolean;
  readonly error?: string;
}

/**
 * Parse the subcommand's argv slice. Exported so tests can exercise
 * flag handling without spawning a subprocess.
 *
 * Rejects:
 *   - both `--prompt-file` and `--prompt` supplied (the latter is not
 *     wired in v1 — see PRD; keep the error message stable so an
 *     accidental copy-paste of an older usage surfaces clearly).
 *   - missing `--feature` / `--prompt-file`.
 *   - unknown flags.
 */
export function parseFlags(argv: ReadonlyArray<string>): ParseResult {
  let featureSlug: string | undefined;
  let promptFilePath: string | undefined;
  let inlinePrompt: string | undefined;
  let repoRoot: string | undefined;
  let modelsCsv: string | undefined;
  let quiet = false;
  let outputRunDir = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      return { ok: true, help: true };
    }
    if (flag === '--quiet') {
      quiet = true;
      continue;
    }
    if (flag === '--output-run-dir') {
      outputRunDir = true;
      continue;
    }
    if (
      flag === '--feature' ||
      flag === '--prompt-file' ||
      flag === '--prompt' ||
      flag === '--repo-root' ||
      flag === '--models'
    ) {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--prompt-file') promptFilePath = value;
      else if (flag === '--prompt') inlinePrompt = value;
      else if (flag === '--repo-root') repoRoot = value;
      else if (flag === '--models') modelsCsv = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag ?? '(empty)'}` };
  }

  if (featureSlug === undefined) {
    return { ok: false, error: '--feature <slug> is required' };
  }
  if (promptFilePath !== undefined && inlinePrompt !== undefined) {
    return {
      ok: false,
      error: '--prompt-file and --prompt are mutually exclusive; supply one',
    };
  }
  if (promptFilePath === undefined) {
    return {
      ok: false,
      error: '--prompt-file <path> is required (inline --prompt not supported)',
    };
  }

  let modelNames: ReadonlyArray<string> | undefined;
  if (modelsCsv !== undefined) {
    const parts = modelsCsv
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length === 0) {
      return { ok: false, error: '--models supplied but resolved to zero entries' };
    }
    modelNames = parts;
  }

  return {
    ok: true,
    flags: {
      repoRoot: repoRoot ?? process.cwd(),
      featureSlug,
      promptFilePath,
      modelNames,
      quiet,
      outputRunDir,
    },
  };
}

/**
 * Render the verb's stdout output. Default mode (outputRunDir=false)
 * emits the full BarrageRun as pretty-printed JSON — machine-readable
 * for the skill's triage walk + the existing audit-barrage cycle.
 *
 * `outputRunDir=true` swaps stdout to a single line: the absolute path
 * of the run-dir, terminated by `\n`. This is the bash-composition
 * shape used by the /dw-lifecycle:implement end-of-task hook (Phase 15
 * Task 4) — `RUN_DIR=$(dw-lifecycle audit-barrage … --output-run-dir)`
 * — and avoids forcing the operator's hook script to depend on `jq`.
 *
 * Stderr behavior is unchanged regardless of the flag: the one-line
 * summary still emits unless `--quiet` is set. The two streams remain
 * independently consumable.
 */
export function renderStdoutOutput(
  run: BarrageRun,
  outputRunDir: boolean,
): string {
  if (outputRunDir) {
    return `${run.runDir}\n`;
  }
  return `${JSON.stringify(run, null, 2)}\n`;
}

/**
 * Resolve the operator-supplied model names against the loaded
 * battery. Unknown names yield an explicit error so a typo doesn't
 * silently drop a model from the run. When `modelNames` is undefined
 * (operator omitted `--models`), the full available battery is
 * returned in its configured order.
 */
export function resolveModels(
  modelNames: ReadonlyArray<string> | undefined,
  available: ReadonlyArray<ModelConfig>,
): { ok: true; models: ReadonlyArray<ModelConfig> } | { ok: false; error: string } {
  if (modelNames === undefined) {
    return { ok: true, models: available };
  }
  const byName = new Map(available.map((m) => [m.name, m]));
  const resolved: ModelConfig[] = [];
  for (const name of modelNames) {
    const config = byName.get(name);
    if (config === undefined) {
      const availableNames = Array.from(byName.keys()).join(', ');
      return {
        ok: false,
        error: `unknown model '${name}' — available: ${availableNames}`,
      };
    }
    resolved.push(config);
  }
  if (resolved.length === 0) {
    return {
      ok: false,
      error: '--models filter selected zero entries from the loaded config',
    };
  }
  return { ok: true, models: resolved };
}

/**
 * Map a BarrageRun's per-model results onto the verb's exit code.
 * Exported for tests; the shim also calls it before exit.
 *
 * Contract (aligned with PRD):
 *   - `0` if AT LEAST ONE model produced positive-byte stdout AND
 *     wasn't a spawn failure.
 *   - `1` if every model failed (spawn error or zero stdout bytes).
 *
 * Non-zero CLI exit + timeout are recorded in INDEX.md as triage
 * metadata; neither precludes the captured stdout from being valuable
 * to the operator's review. A model that emits a complete useful
 * audit response but exits non-zero (rate-limit warnings, partial-
 * completion conventions, lint-style non-zero-on-findings) IS healthy
 * for the purposes of the verb's exit code — the operator gets to see
 * the captured findings either way.
 */
export function deriveBarrageExitCode(run: BarrageRun): 0 | 1 {
  const anyHealthy = run.results.some(isHealthyModelRun);
  return anyHealthy ? 0 : 1;
}

// Per AUDIT-20260601-08: the "model produced liftable output"
// contract is centralized in `isModelRunHealthy` (types.ts). Same
// predicate used by the orchestrator's tip.sha gate — drift-proof
// by construction.
const isHealthyModelRun = isModelRunHealthy;

/**
 * Render the one-line stderr summary describing the run outcome.
 *
 * Per Phase 18 Task 5 (operator directive 2026-06-01): a 1-healthy-
 * model barrage IS a successful audit, not degraded. The audit-
 * barrage is stochastic — auditing as a PRACTICE statistically
 * yields better code, not zero-defect-per-run. Frame partial
 * coverage as success when ≥1 model emitted; only frame the all-
 * models-failed case as outage.
 */
export function renderSummaryLine(run: BarrageRun): string {
  const total = run.results.length;
  const healthy = run.results.filter(isHealthyModelRun).length;
  if (healthy === 0) {
    return `audit-barrage: OUTAGE — 0/${total} models emitted findings (run dir: ${run.runDir})`;
  }
  if (healthy === total) {
    return `audit-barrage: barrage successful — ${healthy}/${total} models emitted findings (run dir: ${run.runDir})`;
  }
  return `audit-barrage: barrage successful — ${healthy} of ${total} models emitted findings; auditing as a practice statistically yields better code (run dir: ${run.runDir})`;
}

/**
 * Subcommand entry. Parses flags, runs the barrage, emits stdout
 * JSON + optional stderr summary, and exits.
 */
export async function auditBarrage(args: string[]): Promise<void> {
  const parsed = parseFlags(args);
  if (parsed.help === true) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (!parsed.ok || parsed.flags === undefined) {
    process.stderr.write(`audit-barrage: ${parsed.error ?? 'parse error'}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }

  const flags = parsed.flags;
  const repoRoot = resolve(flags.repoRoot);

  let config: Awaited<ReturnType<typeof loadAuditBarrageConfig>>;
  try {
    config = await loadAuditBarrageConfig(repoRoot);
  } catch (err) {
    process.stderr.write(`audit-barrage: ${errorMessage(err)}\n`);
    process.exit(2);
  }

  const resolution = resolveModels(flags.modelNames, config.models);
  if (!resolution.ok) {
    process.stderr.write(`audit-barrage: ${resolution.error}\n`);
    process.exit(2);
  }

  const prompt = await loadPromptText(flags.promptFilePath);

  const input: BarrageInput = {
    repoRoot,
    featureSlug: flags.featureSlug,
    prompt,
    models: resolution.models,
  };

  let run: BarrageRun;
  try {
    run = await orchestrateBarrage(input);
  } catch (err) {
    process.stderr.write(`audit-barrage: orchestration failed: ${errorMessage(err)}\n`);
    process.exit(1);
  }

  const result: BarrageResult = {
    run,
    exitCode: deriveBarrageExitCode(run),
  };

  process.stdout.write(renderStdoutOutput(run, flags.outputRunDir));
  if (!flags.quiet) {
    process.stderr.write(`${renderSummaryLine(run)}\n`);
  }
  process.exit(result.exitCode);
}

/**
 * Read the operator-supplied prompt file. A missing / unreadable
 * `--prompt-file` is operator-input error of the same class as
 * malformed `--models` or bad config: usage error, exit 2. Aligning
 * this with the config-loader's exit 2 avoids the wrapper-script
 * mis-signal where "you invoked me wrong" gets the same code as "the
 * audit ran and every model failed."
 */
async function loadPromptText(promptFilePath: string): Promise<string> {
  try {
    return await readFile(promptFilePath, 'utf8');
  } catch (err) {
    process.stderr.write(
      `audit-barrage: failed to read --prompt-file ${promptFilePath}: ${errorMessage(err)}\n`,
    );
    process.exit(2);
  }
}
