/**
 * plugins/dw-lifecycle/src/scope-discovery/audit-barrage/prompt-renderer.ts
 *
 * Loads the audit-barrage prompt template and substitutes its `{{var}}`
 * markers with caller-supplied values. The project-side override at
 * `.dw-lifecycle/scope-discovery/audit-barrage-prompt.md` takes
 * precedence over the plugin's shipped default at
 * `plugins/dw-lifecycle/templates/audit-barrage-prompt.md`.
 *
 * Substitution model:
 *   - Each var declared in `EXPECTED_VARS` is replaced everywhere it
 *     appears as `{{var_name}}`. The HTML comment markers in the
 *     template (`<!-- {{var_name}} -->`) are themselves `{{var_name}}`
 *     occurrences, so they participate in the same substitution; the
 *     comments end up inert in the rendered output. The markers exist
 *     for unsubstituted-var detection: if a marker is missing from the
 *     template OR a `{{...}}` token survives substitution, we throw.
 *   - The substitution is per-token literal: replace every occurrence
 *     of `{{var_name}}` with the supplied value.
 *
 * Failure-loud per `.claude/CLAUDE.md` "never silent fallback":
 *   - Missing template file (both override and default absent) throws.
 *   - Caller-supplied `vars` missing a key the template references throws.
 *   - Caller-supplied `vars` containing an unknown key (not in
 *     `EXPECTED_VARS`) throws — keeps the contract tight so future
 *     template changes are visible at the call site.
 *   - Any `{{...}}` token surviving substitution throws.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorMessage, isEnoent } from '../util/typeguards.js';

/**
 * Names of the substitution variables the canonical audit-barrage
 * prompt template references. Used by the renderer to validate the
 * caller's `vars` payload before substitution.
 *
 * Adding a new var: extend this list, update the template, extend the
 * assembler that builds the `vars` payload — failure-loud at every
 * layer surfaces drift between the three.
 */
export const EXPECTED_VARS: ReadonlyArray<string> = [
  'feature_slug',
  'workplan_summary',
  'diff',
  'audit_log_excerpt',
  'commit_subjects',
] as const;

/** Project-relative override path; resolved against `repoRoot`. */
export const PROMPT_OVERRIDE_PATH =
  '.dw-lifecycle/scope-discovery/audit-barrage-prompt.md';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Absolute path to the plugin's shipped default prompt template. The
 * package layout puts `templates/` two levels above `src/scope-discovery/audit-barrage/`.
 */
export const DEFAULT_PROMPT_TEMPLATE_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'templates',
  'audit-barrage-prompt.md',
);

export interface PromptRenderInput {
  readonly repoRoot: string;
  readonly vars: Readonly<Record<string, string>>;
}

/**
 * Render the audit-barrage prompt. Reads the template (project
 * override takes precedence), validates the caller's vars against
 * `EXPECTED_VARS`, substitutes every `{{var}}` occurrence, and
 * rejects any `{{...}}` token that survives substitution.
 */
export async function renderAuditBarragePrompt(
  input: PromptRenderInput,
): Promise<string> {
  validateVars(input.vars);
  const template = await loadTemplate(input.repoRoot);
  const substituted = substituteVars(template, input.vars);
  rejectUnsubstitutedTokens(substituted);
  return substituted;
}

/**
 * Resolve the template body: project override wins; fall back to the
 * plugin's shipped default. Throws (failure-loud) when neither is
 * readable for a non-ENOENT reason, and throws when the plugin's
 * shipped default is missing entirely (which indicates a corrupted
 * plugin install).
 */
async function loadTemplate(repoRoot: string): Promise<string> {
  const overridePath = resolve(repoRoot, PROMPT_OVERRIDE_PATH);
  const override = await readIfPresent(overridePath);
  if (override !== null) {
    return override;
  }
  try {
    return await readFile(DEFAULT_PROMPT_TEMPLATE_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `audit-barrage prompt-renderer: failed to read plugin default ` +
        `at ${DEFAULT_PROMPT_TEMPLATE_PATH}: ${errorMessage(err)} ` +
        `(the plugin install may be corrupt; reinstall or report this as a bug)`,
    );
  }
}

async function readIfPresent(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw new Error(
      `audit-barrage prompt-renderer: failed to read override ` +
        `at ${absPath}: ${errorMessage(err)}`,
    );
  }
}

function validateVars(vars: Readonly<Record<string, string>>): void {
  const expectedSet = new Set(EXPECTED_VARS);
  const suppliedKeys = Object.keys(vars);

  const missing = EXPECTED_VARS.filter((k) => !(k in vars));
  if (missing.length > 0) {
    throw new Error(
      `audit-barrage prompt-renderer: missing required vars: ${missing.join(', ')} ` +
        `(expected: ${EXPECTED_VARS.join(', ')})`,
    );
  }

  const extra = suppliedKeys.filter((k) => !expectedSet.has(k));
  if (extra.length > 0) {
    throw new Error(
      `audit-barrage prompt-renderer: unknown vars: ${extra.join(', ')} ` +
        `(expected: ${EXPECTED_VARS.join(', ')})`,
    );
  }

  for (const key of EXPECTED_VARS) {
    const value = vars[key];
    if (typeof value !== 'string') {
      throw new Error(
        `audit-barrage prompt-renderer: var '${key}' must be a string ` +
          `(got ${typeof value})`,
      );
    }
  }
}

function substituteVars(
  template: string,
  vars: Readonly<Record<string, string>>,
): string {
  let out = template;
  for (const key of EXPECTED_VARS) {
    const value = vars[key];
    if (value === undefined) {
      // Defensive: validateVars already enforced presence; this guards
      // future refactors that might bypass the validator.
      throw new Error(`audit-barrage prompt-renderer: var '${key}' undefined at substitute time`);
    }
    out = splitAndJoin(out, `{{${key}}}`, value);
  }
  return out;
}

/**
 * Literal-token substitution: split on the marker and join with the
 * value. Avoids RegExp metacharacter pitfalls in the value (a value
 * containing `$&` would be interpreted by `String.prototype.replace`'s
 * second-arg semantics).
 */
function splitAndJoin(input: string, marker: string, value: string): string {
  return input.split(marker).join(value);
}

/**
 * Scan the substituted body for any surviving `{{name}}` token. If the
 * template references a var name not in `EXPECTED_VARS`, the
 * substitution loop won't touch it and this guard fires. Surfaces the
 * offending names so the caller can fix the template (or the var list)
 * with one round-trip.
 */
function rejectUnsubstitutedTokens(rendered: string): void {
  const pattern = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  const seen = new Set<string>();
  let match: RegExpExecArray | null = pattern.exec(rendered);
  while (match !== null) {
    const name = match[1];
    if (typeof name === 'string') seen.add(name);
    match = pattern.exec(rendered);
  }
  if (seen.size > 0) {
    const names = Array.from(seen).sort().join(', ');
    throw new Error(
      `audit-barrage prompt-renderer: unsubstituted token(s) remain in ` +
        `rendered output: ${names} (template references vars not in ` +
        `EXPECTED_VARS, or vars list is out of sync with template)`,
    );
  }
}
