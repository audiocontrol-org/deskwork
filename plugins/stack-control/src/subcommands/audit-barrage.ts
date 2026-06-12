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
import { loadAuditBarrageConfig } from '../scope-discovery/audit-barrage/config-loader.js';
import { resolveCodebaseBoundary } from '../scope-discovery/codebase-boundary.js';
import { orchestrateBarrage } from '../scope-discovery/audit-barrage/orchestrate-barrage.js';
import { renderFleetReportLines } from '../scope-discovery/audit-barrage/run-artifacts.js';
import {
  computeFleetReport,
  isLaneEnforced,
  isModelRunCovering,
  type BarrageInput,
  type BarrageResult,
  type BarrageRun,
  type ModelConfig,
} from '../scope-discovery/audit-barrage/types.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';
import {
  deriveBarrageExitCode,
  renderFleetWarnings,
  zeroOutputModels,
} from './audit-barrage-fleet.js';

// Fleet-degradation/floor logic lives in audit-barrage-fleet.ts
// (extracted for the 300–500 line cap); re-exported here so existing
// import paths — including the test suites — keep working unchanged.
export { deriveBarrageExitCode, renderFleetWarnings } from './audit-barrage-fleet.js';

const USAGE = [
  'Usage: stackctl audit-barrage',
  '    --feature <slug>',
  '    --prompt-file <path>',
  '    [--at <dir>]',
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
  '--at <dir>                Resolve the installation enclosing <dir> instead',
  '                          of the cwd. The run dir lands under',
  '                          `<installation>/.stack-control/',
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
  /**
   * Walk-up start override (`--at <dir>`): resolve the installation
   * enclosing <dir> instead of the cwd. `undefined` = walk up from the
   * cwd (specs/installation-isolation R1/R2; `--repo-root` is RETIRED).
   */
  readonly at: string | undefined;
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
  let at: string | undefined;
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
      flag === '--at' ||
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
      else if (flag === '--at') at = value;
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
      at,
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
 * specs/014 FR-004: the fire-time marking for a lane that runs without
 * mechanical read-only enforcement (`readonly_enforcement: none`). The
 * warning prints at spawn time, unconditionally — an unenforced lane's
 * results carry mutation risk and the operator must know BEFORE triaging.
 * Exported for tests.
 */
export function renderUnenforcedWarning(model: ModelConfig): string {
  // AUDIT-20260611-19: a whitespace-only fragment (constructible only
  // outside the config loader) also lands here via isLaneEnforced — name
  // the actual shape rather than hardcoding the 'none' sentinel.
  const reason =
    model.readonlyEnforcement === 'none'
      ? 'readonly_enforcement: none'
      : 'readonly_enforcement is a whitespace-only fragment — injects zero argv tokens';
  return (
    `audit-barrage: ⚠ lane '${model.name}' runs write-UNENFORCED ` +
    `(${reason}) — its spawn is not mechanically prevented ` +
    `from mutating the repository; results carry mutation risk (FR-004)`
  );
}

// NOTE (specs/015+014 merge): `deriveBarrageExitCode` was EXTRACTED to
// audit-barrage-fleet.ts on main with a more evolved signature
// `(run, requireModels, configuredFleetSize)` — the coverage gate PLUS the
// --require-models floor (AUDIT-20260611-03). It is imported + re-exported above;
// this branch's older inline 1-arg coverage-only version was dropped in favor of it.
// `renderUnenforcedWarning` (014 FR-004, above) has no fleet-module equivalent and
// stays inline.

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

  // specs/installation-isolation US1 (R1): resolve the installation ONCE
  // at verb entry; run-dirs + config reads derive from it. `--at <dir>`
  // overrides the walk-up start point; cwd is only the default start
  // (US4). No enclosing installation → fail loud (US2; no fallback
  // write location).
  let installationRoot: string;
  try {
    installationRoot = resolveCodebaseBoundary({
      startDir: flags.at ?? process.cwd(),
      explicitRoot: null,
    }).installationRoot;
  } catch (err) {
    process.stderr.write(`audit-barrage: FATAL — ${errorMessage(err)}\n`);
    process.exit(2);
  }

  let config: Awaited<ReturnType<typeof loadAuditBarrageConfig>>;
  try {
    config = await loadAuditBarrageConfig(installationRoot);
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

  // specs/014 FR-004: unenforced lanes are loud at fire time — printed
  // regardless of --quiet (quiet suppresses the summary, never a safety
  // marking). Warn-when-NOT-enforced via the shared `isLaneEnforced`
  // predicate (AUDIT-20260611-19) so this loop and spawn-cli's enforcement
  // derivation cannot diverge — a whitespace-only fragment lane is recorded
  // `unenforced` downstream and must warn here too.
  for (const model of resolution.models) {
    if (!isLaneEnforced(model)) {
      process.stderr.write(`${renderUnenforcedWarning(model)}\n`);
    }
  }

  const input: BarrageInput = {
    installationRoot,
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
  // specs/014 FR-007: a degraded fleet prints the fleet report at run end —
  // unconditionally, so degradation is never hidden behind --quiet.
  // AUDIT-20260611-15: a quorum-collapsed fleet (produced ≤ 1) prints it too,
  // even when healthy — cross-model agreement was structurally impossible and
  // that must be stated wherever agreement is reported.
  const fleet = computeFleetReport(run.results);
  if (fleet.produced < fleet.configured || fleet.quorumCollapsed) {
    process.stderr.write(`${renderFleetReportLines(fleet).join('\n')}\n`);
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
