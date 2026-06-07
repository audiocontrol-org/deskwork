/**
 * plugins/stack-control/src/scope-discovery/audit-barrage/config-loader.ts
 *
 * Loads the audit-barrage model battery from YAML. The project-side
 * override at `.stack-control/audit-barrage-config.yaml`
 * takes precedence over the plugin's shipped default at
 * `plugins/stack-control/templates/audit-barrage-config.yaml`.
 *
 * Wire format (mirrored by `schema/audit-barrage-config.yaml.schema.json`):
 *
 *   models:
 *     - name: claude
 *       binary: claude
 *       args_template: "-p {{prompt}}"
 *       timeout_seconds: 300
 *
 * Validation rules (failure-loud per `.claude/CLAUDE.md`):
 *   - top-level `models:` must be a non-empty array.
 *   - each entry must be an object with the four required fields.
 *   - `name`, `binary`, `args_template` must be non-empty strings.
 *   - `args_template` must contain the literal `{{prompt}}` placeholder
 *     — adopters NEED the substitution gate or the spawn helper would
 *     fire the CLI without a prompt argument.
 *   - `timeout_seconds` must be a positive integer.
 *   - `name` must be unique across entries (duplicates would conflict
 *     in run-dir filename derivation + `--models` filtering).
 *
 * Wire-format → in-memory translation: YAML uses `snake_case`
 * (`args_template`, `timeout_seconds`) to match the schema and the
 * conventions of the other plugin YAMLs; the TypeScript shape uses
 * `camelCase` (`argsTemplate`, `timeoutSeconds`) per project style.
 * The translation happens here so callers consume a uniform shape.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { errorMessage, isEnoent, isPlainObject } from '../util/typeguards.js';
import type { ModelConfig } from './types.js';

/** Project-relative override path; resolved against `repoRoot`. */
export const CONFIG_OVERRIDE_PATH = '.stack-control/audit-barrage-config.yaml';

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
): Promise<AuditBarrageConfig> {
  const overridePath = resolve(repoRoot, CONFIG_OVERRIDE_PATH);
  const overrideText = await readIfPresent(overridePath);
  if (overrideText !== null && hasActiveModelsSection(overrideText, overridePath)) {
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
  const timeoutSeconds = requirePositiveInteger(raw, 'timeout_seconds', prefix);
  if (seen.has(name)) {
    throw new Error(
      `${prefix}.name '${name}' is a duplicate (model names must be unique ` +
        `across the battery)`,
    );
  }
  seen.add(name);
  return { name, binary, argsTemplate, timeoutSeconds };
}

function requireNonEmptyString(
  raw: Record<string, unknown>,
  field: string,
  prefix: string,
): string {
  const value = raw[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${prefix}.${field} missing or not a non-empty string`);
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
