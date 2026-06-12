/**
 * plugins/stack-control/src/scope-discovery/audit-barrage/config-loader.ts
 *
 * Loads the audit-barrage model battery from YAML. The project-side
 * override at `.stack-control/audit-barrage-config.yaml`
 * takes precedence over the plugin's shipped default at
 * `plugins/stack-control/templates/audit-barrage-config.yaml`.
 *
 * Wire format — config grammar v2 (normative contract:
 * specs/014-audit-barrage-reliability/contracts/barrage-config-schema.md):
 *
 *   models:
 *     - name: claude
 *       binary: claude
 *       model: opus
 *       args_template: "-p --model {{model}} --output-format stream-json --verbose {{prompt-stdin}}"
 *       readonly_enforcement: "--permission-mode plan"   # or the sentinel: none
 *       output_mode: stream-json        # text | stream-json
 *       liveness_signal: stdout         # stdout | stderr | none
 *       liveness_window_seconds: 60     # required when liveness_signal != none
 *       timeout_floor_seconds: 300      # derivation pair — required unless
 *       timeout_secs_per_kb: 13         #   timeout_seconds override is present
 *       # timeout_seconds: 900          # optional explicit override
 *
 * Validation rules (failure-loud per `.claude/CLAUDE.md`):
 *   - top-level `models:` must be a non-empty array.
 *   - `name`, `binary`, `args_template` (and every other string field)
 *     must be non-BLANK strings — whitespace-only values are rejected,
 *     trim-aware (AUDIT-20260611-17).
 *   - `args_template` must contain `{{model}}` AND exactly one of
 *     `{{prompt}}` / `{{prompt-stdin}}`.
 *   - `model` (explicit pin) and `readonly_enforcement` (fragment or
 *     `none`) are required with NO default — the choice is conscious
 *     (FR-001/FR-004).
 *   - `output_mode` ∈ {text, stream-json}; `liveness_signal` ∈
 *     {stdout, stderr, none}; `liveness_window_seconds` (positive int)
 *     required when the signal is monitored (FR-009) and REFUSED when
 *     the signal is `none` — an unmonitored lane has no window to honor
 *     (AUDIT-20260611-14).
 *   - the derivation pair (`timeout_floor_seconds` + `timeout_secs_per_kb`)
 *     is required unless `timeout_seconds` is present (FR-002).
 *   - an entry missing the v2-required fields is a pre-014 config →
 *     refused with a migration message naming the file, the missing
 *     fields, and the template path (FR-011, SC-006). No silent
 *     compatibility window (Principle V).
 *   - `name` must be unique across entries (duplicates would conflict
 *     in run-dir filename derivation + `--models` filtering).
 *
 * Wire-format → in-memory translation: YAML uses `snake_case`
 * (`args_template`, `timeout_seconds`) to match the schema and the
 * conventions of the other plugin YAMLs; the TypeScript shape uses
 * `camelCase` (`argsTemplate`, `timeoutSeconds`) per project style.
 * The translation happens here so callers consume a uniform shape.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { errorMessage, isEnoent, isPlainObject } from '../util/typeguards.js';
import type { ModelConfig } from './types.js';

/** Project-relative override path; resolved against `repoRoot`. */
export const CONFIG_OVERRIDE_PATH = '.stack-control/audit-barrage-config.yaml';

/**
 * Legacy dw-lifecycle config location (specs/014 US2 — TASK-30 /
 * gh-446). The loader NEVER reads it; its mere presence triggers a loud
 * stderr notice so an adopter who migrated from dw-lifecycle learns
 * their tuned battery stopped applying, instead of silently running on
 * the built-in defaults.
 */
export const LEGACY_DWLIFECYCLE_CONFIG_PATH =
  '.dw-lifecycle/scope-discovery/audit-barrage-config.yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path to the plugin's shipped default config. */
export const DEFAULT_CONFIG_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'templates',
  'audit-barrage-config.yaml',
);

const PROMPT_PLACEHOLDER = '{{prompt}}';
// Phase 19 Task 1 (GH #386): alternative placeholder for stdin-based
// prompt delivery — when present, the spawn helper writes the prompt
// to child.stdin instead of substituting it into argv. Bypasses the
// OS ARG_MAX limit (~256KB on macOS) that fails with spawn E2BIG on
// large diffs.
const PROMPT_STDIN_PLACEHOLDER = '{{prompt-stdin}}';

/**
 * Loaded audit-barrage config. The top-level shape mirrors the YAML;
 * `models` is the typed translation of each entry.
 */
export interface AuditBarrageConfig {
  readonly models: ReadonlyArray<ModelConfig>;
}

/**
 * Resolve the audit-barrage config: project override wins; fall back
 * to the plugin's shipped default. Throws when neither source yields a
 * valid `models:` list AND the override is malformed enough to count
 * as a parse error (not a "models: section commented out" scaffold).
 *
 * Fall-through rules for the override path:
 *   - File absent (ENOENT): use plugin default.
 *   - File present but YAML parses to null / empty document
 *     (`install-scope-discovery` seeds a comments-only scaffold): use
 *     plugin default.
 *   - File present with parseable mapping but no `models:` key OR
 *     `models:` is an empty list: use plugin default. The seeded
 *     scaffold is exactly this shape (commented-out example), so the
 *     "opt-in" boundary is "uncomment models: in the override file".
 *   - File present with malformed YAML, OR `models:` present but
 *     non-array, OR entries fail schema validation: THROW. Silent
 *     fall-through on a half-edited override would mask the operator's
 *     mistake.
 */
export async function loadAuditBarrageConfig(
  repoRoot: string,
  warn: (line: string) => void = (line) => {
    process.stderr.write(line);
  },
): Promise<AuditBarrageConfig> {
  const overridePath = resolve(repoRoot, CONFIG_OVERRIDE_PATH);
  const overrideText = await readIfPresent(overridePath);
  const overrideActive =
    overrideText !== null && hasActiveModelsSection(overrideText, overridePath);
  // specs/014 US2: the notice fires at the decision site — the moment
  // the wrong config would silently win — in every legacy-present
  // combination, and never changes which config wins (research R2).
  emitLegacyConfigNotice(
    repoRoot,
    overrideActive ? overridePath : undefined,
    warn,
  );
  if (overrideActive && overrideText !== null) {
    return parseConfig(overrideText, overridePath);
  }
  let defaultText: string;
  try {
    defaultText = await readFile(DEFAULT_CONFIG_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `audit-barrage config-loader: failed to read plugin default at ` +
        `${DEFAULT_CONFIG_PATH}: ${errorMessage(err)} ` +
        `(the plugin install may be corrupt; reinstall or report this as a bug)`,
    );
  }
  return parseConfig(defaultText, DEFAULT_CONFIG_PATH);
}

/**
 * Probe for the legacy dw-lifecycle config and announce it (specs/014
 * US2). Three lines: the ignored legacy path, the source actually read
 * (the active stack-control override, else the built-in defaults), and
 * the copy-pasteable remediation step. Pure observability — load
 * semantics are untouched in all presence combinations.
 *
 * The third line branches on `activeOverridePath` (AUDIT-20260611-09):
 * when no stack-control override is active, `mv <legacy> <override>` is
 * safe (the destination doesn't exist). When the override IS active,
 * that same mv would silently CLOBBER the operator's tuned battery with
 * the legacy one — and the swap is self-concealing, because once the
 * legacy file moves, this notice never fires again. In the both-present
 * state the operator has already migrated, so the remediation archives
 * the legacy file and must never print a command whose destination is
 * the active override.
 */
function emitLegacyConfigNotice(
  repoRoot: string,
  activeOverridePath: string | undefined,
  warn: (line: string) => void,
): void {
  const legacyPath = resolve(repoRoot, LEGACY_DWLIFECYCLE_CONFIG_PATH);
  if (!existsSync(legacyPath)) return;
  const reading = activeOverridePath ?? 'built-in defaults';
  warn(
    `audit-barrage: WARNING — legacy dw-lifecycle config present and IGNORED: ${legacyPath}\n`,
  );
  warn(`audit-barrage: reading ${reading}\n`);
  if (activeOverridePath === undefined) {
    warn(
      `audit-barrage: migrate with: mv ${legacyPath} ${resolve(repoRoot, CONFIG_OVERRIDE_PATH)} (then review)\n`,
    );
  } else {
    warn(
      `audit-barrage: the active override already exists — archive the legacy file instead: ` +
        `mv ${legacyPath} ${legacyPath}.migrated-to-stack-control (or delete it); ` +
        `do NOT mv it over the active override\n`,
    );
  }
}

/**
 * Decide whether the override file contains an "active" `models:`
 * section. The seeded scaffold ships with `models:` commented out, in
 * which case the YAML parses to either null OR a mapping without a
 * `models:` key. Both are treated as "not active" and the loader falls
 * through to the plugin default.
 *
 * Malformed YAML (parse error) and mappings with a non-array
 * `models:` value are NOT "not active" — they're errors; we re-throw
 * here so the loader's failure-loud contract holds.
 */
function hasActiveModelsSection(text: string, sourceLabel: string): boolean {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(
      `audit-barrage config-loader: ${sourceLabel}: malformed YAML: ${errorMessage(err)}`,
    );
  }
  if (parsed === null || parsed === undefined) return false;
  if (!isPlainObject(parsed)) {
    throw new Error(
      `audit-barrage config-loader: ${sourceLabel}: top-level value must be a mapping`,
    );
  }
  const modelsRaw = parsed['models'];
  if (modelsRaw === undefined || modelsRaw === null) return false;
  if (!Array.isArray(modelsRaw)) {
    throw new Error(
      `audit-barrage config-loader: ${sourceLabel}: 'models:' must be a list when present`,
    );
  }
  return modelsRaw.length > 0;
}

async function readIfPresent(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw new Error(
      `audit-barrage config-loader: failed to read override at ${absPath}: ${errorMessage(err)}`,
    );
  }
}

/**
 * Pure parser exported for tests + callers that already have the
 * config body in memory. `sourceLabel` becomes the prefix on every
 * error message so the operator knows which file the validator
 * rejected.
 */
export function parseConfig(
  body: string,
  sourceLabel: string,
): AuditBarrageConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(body);
  } catch (err) {
    throw new Error(
      `audit-barrage config-loader: ${sourceLabel}: malformed YAML: ${errorMessage(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `audit-barrage config-loader: ${sourceLabel}: top-level value must be a mapping`,
    );
  }
  const modelsRaw = parsed['models'];
  if (!Array.isArray(modelsRaw)) {
    throw new Error(
      `audit-barrage config-loader: ${sourceLabel}: missing required 'models:' list`,
    );
  }
  if (modelsRaw.length === 0) {
    throw new Error(
      `audit-barrage config-loader: ${sourceLabel}: 'models:' list is empty ` +
        `(must have at least one entry; the verb has no default fallback)`,
    );
  }
  const seen = new Set<string>();
  const models: ModelConfig[] = modelsRaw.map((entry, index) =>
    parseEntry(entry, index, sourceLabel, seen),
  );
  return { models };
}

const MODEL_PLACEHOLDER = '{{model}}';
const OUTPUT_MODES = ['text', 'stream-json'] as const;
const LIVENESS_SIGNALS = ['stdout', 'stderr', 'none'] as const;

function parseEntry(
  raw: unknown,
  index: number,
  sourceLabel: string,
  seen: Set<string>,
): ModelConfig {
  const prefix = `audit-barrage config-loader: ${sourceLabel}: models[${index}]`;
  if (!isPlainObject(raw)) {
    throw new Error(`${prefix} is not a mapping`);
  }
  const name = requireNonEmptyString(raw, 'name', prefix);
  const binary = requireNonEmptyString(raw, 'binary', prefix);
  const argsTemplate = requireNonEmptyString(raw, 'args_template', prefix);
  // Phase 19 Task 1 (GH #386): args_template must contain EITHER
  // {{prompt}} (argv-substitution, default) OR {{prompt-stdin}} (stdin
  // delivery, used by CLIs that accept the prompt on stdin to bypass
  // ARG_MAX). The two placeholders are mutually exclusive per entry
  // since the spawn helper picks the delivery path off the template;
  // a template carrying both is ambiguous and rejected.
  const hasArgvPlaceholder = argsTemplate.includes(PROMPT_PLACEHOLDER);
  const hasStdinPlaceholder = argsTemplate.includes(PROMPT_STDIN_PLACEHOLDER);
  if (!hasArgvPlaceholder && !hasStdinPlaceholder) {
    throw new Error(
      `${prefix}.args_template must contain either '${PROMPT_PLACEHOLDER}' (argv ` +
        `substitution) or '${PROMPT_STDIN_PLACEHOLDER}' (stdin delivery) — the spawn ` +
        `helper picks the delivery path off the placeholder`,
    );
  }
  if (hasArgvPlaceholder && hasStdinPlaceholder) {
    throw new Error(
      `${prefix}.args_template contains BOTH '${PROMPT_PLACEHOLDER}' and ` +
        `'${PROMPT_STDIN_PLACEHOLDER}' — these are mutually exclusive (one delivery ` +
        `path per entry)`,
    );
  }
  // AUDIT-20260611-12: {{prompt-stdin}} must be its own whitespace-delimited
  // bare token. Unlike {{model}}/{{prompt}}, which are SUBSTITUTED (intra-token
  // forms like `--model={{model}}` are valid by design), the stdin placeholder
  // is STRIPPED from argv — the prompt travels via child stdin, so there is no
  // argv slot to substitute into. An embedded form (e.g. `--input={{prompt-stdin}}`)
  // would pass the substring checks above, spawn with stdin connected, and leak
  // the literal placeholder token into the CLI's argv. Reject loudly here
  // (Principle V): silently stripping the embedded token would hide a config
  // typo such as an adopter who meant `--input={{prompt}}`.
  if (hasStdinPlaceholder) {
    const hasBareStdinToken = argsTemplate
      .trim()
      .split(/\s+/)
      .some((token) => token === PROMPT_STDIN_PLACEHOLDER);
    if (!hasBareStdinToken) {
      throw new Error(
        `${prefix} ('${name}').args_template embeds '${PROMPT_STDIN_PLACEHOLDER}' ` +
          `inside a larger token — it must appear as its own whitespace-delimited ` +
          `bare token. Stdin delivery has no argv slot to substitute into: the ` +
          `spawn helper strips the bare token and writes the prompt to the child's ` +
          `stdin, so an embedded form (e.g. '--input=${PROMPT_STDIN_PLACEHOLDER}') ` +
          `would leak the literal placeholder into the CLI's argv. If the CLI takes ` +
          `the prompt as an option value, use '${PROMPT_PLACEHOLDER}' instead ` +
          `(e.g. '--input=${PROMPT_PLACEHOLDER}')`,
      );
    }
  }

  // specs/014 FR-011 migration gate: collect every missing v2-required
  // field FIRST and refuse with one message naming the file, the
  // fields, and the template to copy from. A config that predates 014
  // (bare v1 shape) hits this in one read instead of field-by-field.
  const missing: string[] = [];
  const modelRaw = raw['model'];
  if (typeof modelRaw !== 'string' || modelRaw.length === 0) {
    missing.push('model (explicit model pin, FR-001)');
  }
  if (!argsTemplate.includes(MODEL_PLACEHOLDER)) {
    missing.push(`args_template '${MODEL_PLACEHOLDER}' placeholder (FR-001)`);
  }
  const enforcementRaw = raw['readonly_enforcement'];
  if (typeof enforcementRaw !== 'string' || enforcementRaw.length === 0) {
    missing.push("readonly_enforcement (CLI fragment, or the sentinel 'none')");
  }
  if (raw['output_mode'] === undefined || raw['output_mode'] === null) {
    missing.push('output_mode (text | stream-json)');
  }
  if (raw['liveness_signal'] === undefined || raw['liveness_signal'] === null) {
    missing.push('liveness_signal (stdout | stderr | none)');
  }
  const hasOverride =
    raw['timeout_seconds'] !== undefined && raw['timeout_seconds'] !== null;
  const hasFloor =
    raw['timeout_floor_seconds'] !== undefined &&
    raw['timeout_floor_seconds'] !== null;
  const hasSlope =
    raw['timeout_secs_per_kb'] !== undefined && raw['timeout_secs_per_kb'] !== null;
  if (!hasOverride && !hasFloor && !hasSlope) {
    missing.push(
      'timeout derivation (timeout_floor_seconds + timeout_secs_per_kb), or an explicit timeout_seconds',
    );
  }
  if (missing.length > 0) {
    throw new Error(
      `${prefix} ('${name}') is missing required field(s): ${missing.join('; ')} — ` +
        `this looks like a pre-014 (v1) barrage config. Migrate the file to the v2 ` +
        `lane grammar; copy from the shipped template at ${DEFAULT_CONFIG_PATH} ` +
        `(FR-011)`,
    );
  }

  // Field-level value validation (present but invalid). The missing-field
  // gate above already threw when these were absent; re-deriving through the
  // validators keeps the types narrow without a cast.
  const model = requireNonEmptyString(raw, 'model', `${prefix} ('${name}')`);
  const readonlyEnforcement = requireNonEmptyString(
    raw,
    'readonly_enforcement',
    `${prefix} ('${name}')`,
  );
  const outputMode = requireEnum(raw, 'output_mode', OUTPUT_MODES, prefix);
  const livenessSignal = requireEnum(raw, 'liveness_signal', LIVENESS_SIGNALS, prefix);
  let livenessWindowSeconds: number | undefined;
  if (livenessSignal !== 'none') {
    livenessWindowSeconds = requirePositiveInteger(
      raw,
      'liveness_window_seconds',
      prefix,
    );
  } else if (
    raw['liveness_window_seconds'] !== undefined &&
    raw['liveness_window_seconds'] !== null
  ) {
    // AUDIT-20260611-14: a window on a `none` lane is inert — the spawn
    // helper computes monitored = signal !== 'none', so the watchdog never
    // arms and the field would be silently swallowed. Refuse loudly
    // (Principle V): a reader who set a window on a `none` lane believes
    // liveness is monitored when it isn't.
    throw new Error(
      `${prefix} ('${name}').liveness_window_seconds is set but ` +
        `liveness_signal is 'none' — an unmonitored lane has no window to ` +
        `honor (the watchdog never arms). Set liveness_signal to stdout or ` +
        `stderr to monitor liveness, or remove liveness_window_seconds`,
    );
  }

  // FR-002: the override displaces the derivation pair when present; a
  // half-supplied pair without an override is a config typo, not a shape
  // the derivation can silently work around.
  let timeoutSeconds: number | undefined;
  let timeoutFloorSeconds: number | undefined;
  let timeoutSecsPerKb: number | undefined;
  if (hasOverride) {
    timeoutSeconds = requirePositiveInteger(raw, 'timeout_seconds', prefix);
  }
  if (!hasOverride && hasFloor !== hasSlope) {
    const absent = hasFloor ? 'timeout_secs_per_kb' : 'timeout_floor_seconds';
    throw new Error(
      `${prefix}.${absent} missing: the derivation pair (timeout_floor_seconds + ` +
        `timeout_secs_per_kb) must be complete unless a timeout_seconds override ` +
        `is present (FR-002)`,
    );
  }
  if (hasFloor) {
    timeoutFloorSeconds = requirePositiveInteger(raw, 'timeout_floor_seconds', prefix);
  }
  if (hasSlope) {
    timeoutSecsPerKb = requirePositiveNumber(raw, 'timeout_secs_per_kb', prefix);
  }

  if (seen.has(name)) {
    throw new Error(
      `${prefix}.name '${name}' is a duplicate (model names must be unique ` +
        `across the battery)`,
    );
  }
  seen.add(name);
  return {
    name,
    binary,
    argsTemplate,
    model,
    readonlyEnforcement,
    outputMode,
    livenessSignal,
    ...(livenessWindowSeconds !== undefined ? { livenessWindowSeconds } : {}),
    ...(timeoutFloorSeconds !== undefined ? { timeoutFloorSeconds } : {}),
    ...(timeoutSecsPerKb !== undefined ? { timeoutSecsPerKb } : {}),
    ...(timeoutSeconds !== undefined ? { timeoutSeconds } : {}),
  };
}

function requireEnum<T extends string>(
  raw: Record<string, unknown>,
  field: string,
  allowed: ReadonlyArray<T>,
  prefix: string,
): T {
  const value = raw[field];
  const matched = allowed.find((candidate) => candidate === value);
  if (matched !== undefined) return matched;
  throw new Error(
    `${prefix}.${field} must be one of: ${allowed.join(' | ')} (got ${describeValue(value)})`,
  );
}

function requirePositiveNumber(
  raw: Record<string, unknown>,
  field: string,
  prefix: string,
): number {
  const value = raw[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `${prefix}.${field} must be a positive number (got ${describeValue(value)})`,
    );
  }
  return value;
}

function requireNonEmptyString(
  raw: Record<string, unknown>,
  field: string,
  prefix: string,
): string {
  const value = raw[field];
  // AUDIT-20260611-17: trim-aware — a quoted whitespace-only YAML value
  // (e.g. readonly_enforcement: "   ") passed a bare length check, loaded
  // as a "real" value, and downstream treated it as substantive: the lane
  // was marked `enforced` while buildArgs trimmed/split the fragment to
  // zero tokens and injected NOTHING (FR-003/FR-004 violation). Non-blank
  // required across every string field; the sentinel 'none' and real
  // fragments are unaffected.
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `${prefix}.${field} missing or not a non-blank string ` +
        `(whitespace-only values are rejected)`,
    );
  }
  return value;
}

function requirePositiveInteger(
  raw: Record<string, unknown>,
  field: string,
  prefix: string,
): number {
  const value = raw[field];
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${prefix}.${field} must be a positive integer (got ${describeValue(value)})`,
    );
  }
  return value;
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return `${value}`;
  if (typeof value === 'string') return `'${value}'`;
  return typeof value;
}
