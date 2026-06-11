/**
 * plugins/stack-control/src/subcommands/audit-barrage.ts
 *
 * CLI shim for the multi-model audit barrage. Parses flags, composes a
 * BarrageInput, dispatches `orchestrateBarrage`, then emits:
 *
 *   - stdout: BarrageRun as JSON (machine-readable; consumed by the
 *     skill's triage walk).
 *   - stderr: one-line summary unless `--quiet`.
 *
 * Exit code contract (per the audit-barrage PRD acceptance criteria;
 * gated on COVERAGE — AUDIT-20260607-42):
 *
 *   0 — at least one COVERING family (positive-byte stdout, no spawn
 *       failure, AND exit 0). Non-zero-exit / timed-out families are
 *       still lifted for findings when coverage exists; they are just
 *       not themselves covering.
 *   1 — OUTAGE: zero covering families (every family was a spawn error,
 *       a timeout, a non-zero exit, OR emitted zero bytes).
 *   2 — usage error (missing required flag, mutually-exclusive flags,
 *       unknown flag).
 *
 * # Model configuration is loaded from YAML
 *
 * The model battery is loaded by `loadAuditBarrageConfig(repoRoot)` —
 * project override at `.stack-control/audit-barrage-config.yaml`
 * takes precedence over the plugin's shipped default at
 * `plugins/stack-control/templates/audit-barrage-config.yaml`. See
 * `scope-discovery/audit-barrage/config-loader.ts` for the resolution
 * + validation rules.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadAuditBarrageConfig } from '../scope-discovery/audit-barrage/config-loader.js';
import { orchestrateBarrage } from '../scope-discovery/audit-barrage/orchestrate-barrage.js';
import {
  isModelRunCovering,
  type BarrageInput,
  type BarrageResult,
  type BarrageRun,
  type ModelConfig,
  type ModelRunResult,
} from '../scope-discovery/audit-barrage/types.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';

const USAGE = [
  'Usage: stackctl audit-barrage',
  '    --feature <slug>',
  '    --prompt-file <path>',
  '    [--repo-root <path>]',
  '    [--models <comma-list>]',
  '    [--require-models <n>]',
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
  '                          `<repo-root>/.stack-control/',
  '                          audit-runs/<timestamp>-<feature>/`.',
  '--models <comma-list>     Comma-separated subset of the configured models.',
  '                          Defaults to every model in the loaded config.',
  '--require-models <n>      Minimum number of EMITTING models (stdout bytes',
  '                          > 0) for the run to pass. The effective floor is',
  '                          min(n, CONFIGURED fleet size) — a --models subset',
  '                          does not lower it (AUDIT-20260611-03); a',
  '                          shortfall fails loudly naming expected vs actual.',
  '                          Default: no floor (specs/014 US1).',
  '--quiet                   Suppress the stderr summary line.',
  '--output-run-dir          Print JUST the absolute run-dir path on stdout',
  '                          (BarrageRun JSON is suppressed). For bash',
  '                          composition in govern-spec.sh / govern.sh:',
  '                          RUN_DIR=$(stackctl',
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
  /**
   * Minimum number of EMITTING models (stdoutBytes > 0) required for
   * the run to pass — `--require-models <n>` (specs/014 US1).
   * `undefined` = no floor (the manual-run default; govern passes 2).
   */
  readonly requireModels: number | undefined;
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
  let requireModelsRaw: string | undefined;
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
      flag === '--models' ||
      flag === '--require-models'
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
      else if (flag === '--require-models') requireModelsRaw = value;
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

  let requireModels: number | undefined;
  if (requireModelsRaw !== undefined) {
    const n = Number(requireModelsRaw);
    if (!Number.isInteger(n) || n < 1) {
      return {
        ok: false,
        error: `--require-models requires a positive integer, got '${requireModelsRaw}'`,
      };
    }
    requireModels = n;
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
      requireModels,
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
 * shape used by the govern-spec.sh / govern.sh (Phase 15
 * Task 4) — `RUN_DIR=$(stackctl audit-barrage … --output-run-dir)`
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
 * A configured model is ZERO-OUTPUT DEGRADED iff `stdoutBytes === 0` —
 * timeout or not (specs/014 US1, research R1). A model with partial
 * output before a timeout (`stdoutBytes > 0`) is NOT zero-output
 * degraded. "Emitting model" := `stdoutBytes > 0`.
 */
function zeroOutputModels(run: BarrageRun): ReadonlyArray<ModelRunResult> {
  return run.results.filter((r) => r.stdoutBytes === 0);
}

function emittingCount(run: BarrageRun): number {
  return run.results.filter((r) => r.stdoutBytes > 0).length;
}

function zeroOutputCause(r: ModelRunResult): string {
  if (r.timedOut) {
    return `timed out after ${Math.round(r.durationMs / 1000)}s`;
  }
  if (r.spawnError !== undefined) {
    return `spawn failed: ${r.spawnError}`;
  }
  return `exited ${r.exitCode}`;
}

/**
 * Fleet-floor evaluation (specs/014 US1, research R1). The floor counts
 * EMITTING models (stdoutBytes > 0) against
 * `min(requested, CONFIGURED fleet size)` so a one-model fleet doesn't
 * make strict mode unsatisfiable nonsense — the clamp itself is named
 * to the operator as a configured-fleet shortfall.
 *
 * `configuredFleetSize` is the size of the LOADED CONFIG's model
 * battery, NOT the `--models` / `GOVERN_MODELS` subset actually run
 * (AUDIT-20260611-03): clamping against the subset would let a
 * single-model selection quietly defeat govern's floor 2 — the
 * cross-model agreement floor would become opt-out-able via an env var
 * with no exit-code consequence. The parameter is required so call
 * sites can't silently reuse the subset; `selected` (the models
 * actually run) is carried separately so the shortfall message can
 * name selection — not model health — as the cause.
 */
interface FleetFloorEvaluation {
  readonly requested: number;
  readonly effectiveFloor: number;
  readonly emitting: number;
  readonly fleetSize: number;
  readonly selected: number;
  readonly clamped: boolean;
  readonly satisfied: boolean;
}

function evaluateFleetFloor(
  run: BarrageRun,
  requested: number,
  configuredFleetSize: number,
): FleetFloorEvaluation {
  const effectiveFloor = Math.min(requested, configuredFleetSize);
  const emitting = emittingCount(run);
  return {
    requested,
    effectiveFloor,
    emitting,
    fleetSize: configuredFleetSize,
    selected: run.results.length,
    clamped: requested > configuredFleetSize,
    satisfied: emitting >= effectiveFloor,
  };
}

/**
 * Render the stderr degradation warnings for the run (specs/014 US1 —
 * TASK-29 / gh-447: a partial fleet must be LOUD at the moment of
 * failure, not discoverable only in the run JSON).
 *
 * Lines emitted, in order:
 *   1. One WARNING per zero-output model, naming the model and the
 *      cause (timeout / exit code / spawn failure).
 *   2. The lost-agreement consequence line when any model is
 *      zero-output AND fewer than 2 models emitted — cross-model
 *      agreement is the HIGH-confidence signal the barrage runs for.
 *   3. With a floor requested: a NOTE when the floor was clamped to the
 *      configured fleet size, and the loud shortfall line (expected vs
 *      actual + each non-emitting model) when the floor is unmet. When
 *      the SELECTED model count (the --models / GOVERN_MODELS subset
 *      actually run) is itself below the effective floor, an extra line
 *      names selection as the cause so the operator knows the floor
 *      failed by selection, not a sick model (AUDIT-20260611-03).
 *
 * `configuredFleetSize` is the loaded config's battery size; when
 * absent it falls back to `run.results.length` (back-compat for
 * library callers without subset selection, where the two are equal —
 * the CLI entry always passes the configured size explicitly).
 *
 * A fully-healthy fleet yields [] — no cry-wolf text.
 */
export function renderFleetWarnings(
  run: BarrageRun,
  requireModels?: number,
  configuredFleetSize?: number,
): ReadonlyArray<string> {
  const lines: string[] = [];
  const degraded = zeroOutputModels(run);
  for (const r of degraded) {
    lines.push(
      `audit-barrage: WARNING — model '${r.name}' produced no output (${zeroOutputCause(r)})`,
    );
  }
  const emitting = emittingCount(run);
  if (degraded.length > 0 && emitting < 2) {
    const noun = emitting === 1 ? 'model' : 'models';
    lines.push(
      `audit-barrage: WARNING — only ${emitting} ${noun} emitted findings this round; cross-model agreement (the HIGH-confidence signal) is unavailable`,
    );
  }
  if (requireModels !== undefined) {
    const floor = evaluateFleetFloor(
      run,
      requireModels,
      configuredFleetSize ?? run.results.length,
    );
    if (floor.clamped) {
      lines.push(
        `audit-barrage: NOTE — --require-models ${floor.requested} exceeds the configured fleet size ${floor.fleetSize}; effective floor is ${floor.effectiveFloor}`,
      );
    }
    if (!floor.satisfied) {
      // Name the cause: selection (the --models / GOVERN_MODELS subset
      // is itself below the effective floor — AUDIT-20260611-03) and/or
      // model health (selected models that emitted nothing). At least
      // one always applies when the floor is unmet.
      const causes: string[] = [];
      if (floor.selected < floor.effectiveFloor) {
        causes.push(
          `only ${floor.selected} of ${floor.fleetSize} configured models were selected via --models/GOVERN_MODELS; the floor counts the configured fleet`,
        );
      }
      const nonEmitting = run.results
        .filter((r) => r.stdoutBytes === 0)
        .map((r) => r.name)
        .join(', ');
      if (nonEmitting.length > 0) {
        causes.push(`non-emitting: ${nonEmitting}`);
      }
      lines.push(
        `audit-barrage: FLOOR SHORTFALL — required ${floor.effectiveFloor} emitting model(s), got ${floor.emitting} (${causes.join('; ')})`,
      );
    }
  }
  return lines;
}

/**
 * Map a BarrageRun's per-model results onto the verb's exit code.
 * Exported for tests; the shim also calls it before exit.
 *
 * Contract (gated on COVERAGE — AUDIT-20260607-42):
 *   - `0` if AT LEAST ONE COVERING family exists (positive-byte stdout,
 *     no spawn failure, AND exit 0).
 *   - `1` (OUTAGE) if zero families cover — every family was a spawn
 *     error, a timeout, a non-zero exit, OR emitted zero bytes.
 *
 * Coverage, not liftability, is the gate. A non-zero-exit family that
 * emitted bytes is still LIFTED for findings (the lift reads each
 * model's `.md` by file presence) whenever the run has coverage from
 * some other family — so its findings are never discarded. But it does
 * NOT itself count as a covering family: for the LLM CLIs this barrage
 * drives, a non-zero exit usually signals a failure (rate-limit, auth
 * expiry, mid-stream drop). Counting a crash-after-banner family as
 * "clean" would let an OUTAGE masquerade as governed-clean in the
 * single-family floor case (FR-005/US3/SC-003) — the exact hole this
 * split closes. Only when EVERY family is non-covering does the run
 * become an OUTAGE (exit 1) → `protocol.ts` fails loud and does NOT
 * auto-lift; the run-dir `.md` artifacts remain for manual triage.
 *
 * Floor (specs/014 US1, additive — FR-002/FR-014): when
 * `requireModels` is supplied, an emitting-model shortfall against the
 * clamped floor is ALSO exit 1. The clamp is against
 * `configuredFleetSize` — the loaded config's battery, NOT the
 * `--models` / `GOVERN_MODELS` subset actually run — so subset
 * selection cannot lower the floor (AUDIT-20260611-03). When the
 * parameter is absent it falls back to `run.results.length`
 * (back-compat for library callers without subset selection, where the
 * two are equal; the CLI entry passes the configured size explicitly).
 * Default (no floor) semantics are byte-identical to the pre-014
 * contract.
 */
export function deriveBarrageExitCode(
  run: BarrageRun,
  requireModels?: number,
  configuredFleetSize?: number,
): 0 | 1 {
  const anyCovering = run.results.some(isModelRunCovering);
  if (!anyCovering) {
    return 1;
  }
  if (
    requireModels !== undefined &&
    !evaluateFleetFloor(
      run,
      requireModels,
      configuredFleetSize ?? run.results.length,
    ).satisfied
  ) {
    return 1;
  }
  return 0;
}

/**
 * Render the one-line stderr summary describing the run outcome.
 *
 * Per Phase 18 Task 5 (operator directive 2026-06-01): a 1-covering-
 * family barrage IS a successful audit, not degraded. The audit-
 * barrage is stochastic — auditing as a PRACTICE statistically yields
 * better code, not zero-defect-per-run. Frame partial coverage as
 * success when ≥1 family COVERS; only frame the zero-coverage case as
 * outage.
 *
 * Per AUDIT-20260607-42 the count is COVERAGE (`isModelRunCovering`),
 * not liftability. A non-zero-exit-with-bytes family is lifted but does
 * not increment the covering count — so the summary can never report a
 * crash-after-banner run as "successful — 1/1 models emitted findings."
 */
export function renderSummaryLine(run: BarrageRun): string {
  const total = run.results.length;
  const covering = run.results.filter(isModelRunCovering).length;
  if (covering === 0) {
    return `audit-barrage: OUTAGE — 0/${total} models emitted findings (run dir: ${run.runDir})`;
  }
  if (covering === total) {
    return `audit-barrage: barrage successful — ${covering}/${total} models emitted findings (run dir: ${run.runDir})`;
  }
  const degraded = zeroOutputModels(run).map((r) => r.name);
  const degradedNote =
    degraded.length > 0 ? `; zero-output: ${degraded.join(', ')}` : '';
  return `audit-barrage: barrage successful — ${covering} of ${total} models emitted findings${degradedNote}; auditing as a practice statistically yields better code (run dir: ${run.runDir})`;
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

  // The floor evaluates against the CONFIGURED fleet size — never the
  // --models subset actually run (AUDIT-20260611-03).
  const configuredFleetSize = config.models.length;
  const result: BarrageResult = {
    run,
    exitCode: deriveBarrageExitCode(run, flags.requireModels, configuredFleetSize),
  };

  process.stdout.write(renderStdoutOutput(run, flags.outputRunDir));
  // Degradation warnings are loudness, not summary chrome — they emit
  // even under --quiet (specs/014 US1; --quiet suppresses only the
  // one-line summary).
  for (const warning of renderFleetWarnings(run, flags.requireModels, configuredFleetSize)) {
    process.stderr.write(`${warning}\n`);
  }
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
