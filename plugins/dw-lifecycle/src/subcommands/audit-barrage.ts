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
 * # Default model configuration is hard-coded in this file
 *
 * The three v1 model configs (`claude`, `codex`, `gemini`) live in
 * `DEFAULT_MODEL_CONFIGS` below. The args templates mirror the
 * documented invocation pattern from `audit-barrage-cli-notes.md`. The
 * YAML config loader (project-override via
 * `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml`) is the
 * next workplan task; once it lands, this constant gets replaced by a
 * call to the loader.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { orchestrateBarrage } from '../scope-discovery/audit-barrage/orchestrate-barrage.js';
import type {
  BarrageInput,
  BarrageResult,
  BarrageRun,
  ModelConfig,
  ModelRunResult,
} from '../scope-discovery/audit-barrage/types.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';

/**
 * v1 default model battery — mirrors the three CLIs probed in
 * `audit-barrage-cli-notes.md`. Adopters whose environment differs
 * (different binary path, different model selection) will override
 * via the YAML config loader once that lands.
 */
export const DEFAULT_MODEL_CONFIGS: ReadonlyArray<ModelConfig> = [
  {
    name: 'claude',
    binary: 'claude',
    argsTemplate: '-p {{prompt}}',
    timeoutSeconds: 300,
  },
  {
    name: 'codex',
    binary: 'codex',
    argsTemplate: 'exec {{prompt}}',
    timeoutSeconds: 300,
  },
  {
    name: 'gemini',
    binary: 'gemini',
    argsTemplate: '{{prompt}}',
    timeoutSeconds: 300,
  },
];

const USAGE = [
  'Usage: dw-lifecycle audit-barrage',
  '    --feature <slug>',
  '    --prompt-file <path>',
  '    [--repo-root <path>]',
  '    [--models <comma-list>]',
  '    [--quiet]',
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
  '--models <comma-list>     Comma-separated subset of the default models',
  '                          (claude, codex, gemini). Defaults to all three.',
  '--quiet                   Suppress the stderr summary line.',
  '',
  'Fires the selected CLIs in parallel, captures per-model output into',
  'the run dir, and emits a BarrageRun record as JSON on stdout.',
  '',
].join('\n');

/**
 * Parsed flag state. Exported for the test-side flag assertion paths.
 */
export interface ParsedFlags {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly promptFilePath: string;
  readonly modelNames: ReadonlyArray<string>;
  readonly quiet: boolean;
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

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      return { ok: true, help: true };
    }
    if (flag === '--quiet') {
      quiet = true;
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

  const modelNames =
    modelsCsv === undefined
      ? DEFAULT_MODEL_CONFIGS.map((m) => m.name)
      : modelsCsv
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
  if (modelNames.length === 0) {
    return { ok: false, error: '--models supplied but resolved to zero entries' };
  }

  return {
    ok: true,
    flags: {
      repoRoot: repoRoot ?? process.cwd(),
      featureSlug,
      promptFilePath,
      modelNames,
      quiet,
    },
  };
}

/**
 * Resolve the operator-supplied model names against the default
 * battery. Unknown names yield an explicit error so a typo doesn't
 * silently drop a model from the run.
 */
export function resolveModels(
  modelNames: ReadonlyArray<string>,
  available: ReadonlyArray<ModelConfig> = DEFAULT_MODEL_CONFIGS,
): { ok: true; models: ReadonlyArray<ModelConfig> } | { ok: false; error: string } {
  const byName = new Map(available.map((m) => [m.name, m]));
  const resolved: ModelConfig[] = [];
  for (const name of modelNames) {
    const config = byName.get(name);
    if (config === undefined) {
      const available = Array.from(byName.keys()).join(', ');
      return {
        ok: false,
        error: `unknown model '${name}' — available: ${available}`,
      };
    }
    resolved.push(config);
  }
  return { ok: true, models: resolved };
}

/**
 * Map a BarrageRun's per-model results onto the verb's exit code.
 * Exported for tests; the shim also calls it before exit.
 */
export function deriveBarrageExitCode(run: BarrageRun): 0 | 1 {
  const anyHealthy = run.results.some(isHealthyModelRun);
  return anyHealthy ? 0 : 1;
}

function isHealthyModelRun(result: ModelRunResult): boolean {
  return (
    result.exitCode === 0 &&
    !result.timedOut &&
    result.spawnError === undefined &&
    result.stdoutBytes > 0
  );
}

/**
 * Render the one-line stderr summary describing the run outcome.
 */
export function renderSummaryLine(run: BarrageRun): string {
  const total = run.results.length;
  const healthy = run.results.filter(isHealthyModelRun).length;
  return `audit-barrage: ${healthy}/${total} models produced output (run dir: ${run.runDir})`;
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
  const resolution = resolveModels(flags.modelNames);
  if (!resolution.ok) {
    process.stderr.write(`audit-barrage: ${resolution.error}\n`);
    process.exit(2);
  }

  const prompt = await loadPromptText(flags.promptFilePath);
  const repoRoot = resolve(flags.repoRoot);

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

  process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
  if (!flags.quiet) {
    process.stderr.write(`${renderSummaryLine(run)}\n`);
  }
  process.exit(result.exitCode);
}

async function loadPromptText(promptFilePath: string): Promise<string> {
  try {
    return await readFile(promptFilePath, 'utf8');
  } catch (err) {
    process.stderr.write(
      `audit-barrage: failed to read --prompt-file ${promptFilePath}: ${errorMessage(err)}\n`,
    );
    process.exit(1);
  }
}
