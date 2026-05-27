/**
 * Pipeline template loader + override-aware enumeration.
 *
 * Two functions, both sync:
 *
 *   - `loadPipelineTemplate(id, projectRoot)` resolves a template by id.
 *     Checks `<projectRoot>/.deskwork/pipelines/<id>.json` first, then
 *     falls back to the plugin's built-in defaults shipped next to this
 *     file. Throws (never returns null / a fallback shape) when neither
 *     source exists or when the JSON fails Zod validation.
 *
 *   - `listAvailablePipelineTemplates(projectRoot)` enumerates every id
 *     visible to the operator, deduplicated with override-takes-
 *     precedence semantics. Suitable for showing the operator a picker;
 *     callers resolve each id through `loadPipelineTemplate` to get the
 *     full template.
 *
 * Design notes:
 *
 *   - Sync I/O matches the override resolver's design (see
 *     `../overrides.ts`). Templates are read on cold paths (project
 *     bootstrap, picker enumeration) — no microtask overhead concerns
 *     justify going async.
 *
 *   - No caching. The template is small and the readFile+parse pair is
 *     cheap; cache invalidation across project-override file edits
 *     would cost more than the read.
 *
 *   - The plugin-default fallback resolves files relative to THIS
 *     module's location, NOT a project path. At runtime in dist/, the
 *     JSON files live next to the compiled JS; the build script copies
 *     `src/pipelines/*.json` into `dist/pipelines/`. The resolver uses
 *     `import.meta.url` so both source-mode (tsx) and built-mode (node
 *     dist/) work without configuration.
 *
 *   - JSON files may carry a top-level `"$rationale"` string as a
 *     comments-in-JSON workaround; the schema's `.passthrough()`
 *     ignores it. Operator-authored override templates can include or
 *     omit the field freely.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PipelineTemplateSchema, type PipelineTemplate } from './types.ts';

/**
 * Directory shipping the plugin's built-in preset templates. The path
 * is resolved relative to the compiled module's location (works in
 * both source-mode and dist-mode without configuration).
 */
const PLUGIN_DEFAULTS_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Directory inside a project where operator overrides live.
 */
function projectOverridesDir(projectRoot: string): string {
  return join(projectRoot, '.deskwork', 'pipelines');
}

/**
 * Read + parse + Zod-validate a single JSON file into a
 * `PipelineTemplate`. Throws with a descriptive message on every
 * failure mode (file missing, JSON parse error, schema violation).
 *
 * The `expectedId` argument is the basename caller asked for; the
 * loader verifies the JSON's `id` field matches so a misnamed file
 * (e.g. `editorial.json` carrying `"id": "visual"`) fails loudly.
 */
function readAndValidate(path: string, expectedId: string): PipelineTemplate {
  if (!existsSync(path)) {
    throw new Error(`Pipeline template file not found: ${path}`);
  }
  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Pipeline template at ${path} is not valid JSON: ${detail}`);
  }
  const result = PipelineTemplateSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Pipeline template at ${path} failed Zod validation:\n${issues}`,
    );
  }
  if (result.data.id !== expectedId) {
    throw new Error(
      `Pipeline template at ${path} declares id "${result.data.id}" but was loaded as "${expectedId}" — `
      + `the JSON \`id\` field must equal the filename basename. `
      + `Either rename the file to "${result.data.id}.json", or change the JSON's id to "${expectedId}".`,
    );
  }
  return result.data;
}

/**
 * Load a pipeline template by id. Tries the project override first,
 * then falls back to the plugin's built-in defaults. Throws when
 * neither exists OR when the JSON fails Zod validation.
 *
 * @param id - The template id (matches the JSON filename basename).
 * @param projectRoot - Absolute path to the project root.
 * @throws When both project override and plugin default are missing,
 *   when the JSON fails to parse, when Zod validation fails, or when
 *   the JSON's `id` field disagrees with the filename basename.
 */
export function loadPipelineTemplate(id: string, projectRoot: string): PipelineTemplate {
  if (id.trim().length === 0) {
    throw new Error(
      `loadPipelineTemplate requires a non-empty id; received ${JSON.stringify(id)}`,
    );
  }
  // Override-takes-precedence: project path wins when present.
  const overridePath = join(projectOverridesDir(projectRoot), `${id}.json`);
  if (existsSync(overridePath)) {
    return readAndValidate(overridePath, id);
  }
  const defaultPath = join(PLUGIN_DEFAULTS_DIR, `${id}.json`);
  if (existsSync(defaultPath)) {
    return readAndValidate(defaultPath, id);
  }
  throw new Error(
    `Pipeline template "${id}" not found.\n`
    + `  Searched project override: ${overridePath}\n`
    + `  Searched plugin default:   ${defaultPath}`,
  );
}

/**
 * Enumerate every `.json` file in a directory and return their
 * basenames (without the extension). Missing directory is treated as
 * empty — neither the project nor the plugin defaults directory is
 * required to exist for enumeration to succeed.
 */
function listJsonBasenames(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => basename(entry, '.json'));
}

/**
 * List every available pipeline template id, deduplicated by id with
 * project overrides taking precedence over plugin defaults. The result
 * is suitable for showing the operator a picker; resolve each id via
 * `loadPipelineTemplate` to get the full template.
 *
 * The function does NOT validate any template — it just enumerates
 * what's on disk. A malformed override JSON still appears in the list;
 * the operator finds out about the malformation at load time.
 *
 * @param projectRoot - Absolute path to the project root.
 */
export function listAvailablePipelineTemplates(projectRoot: string): string[] {
  const overrideIds = listJsonBasenames(projectOverridesDir(projectRoot));
  const defaultIds = listJsonBasenames(PLUGIN_DEFAULTS_DIR);
  // De-duplicate by id; overrides win, but for enumeration both sources
  // contribute the same id to the same slot in the de-dup set, so
  // precedence is moot until the operator calls loadPipelineTemplate.
  const all = new Set<string>([...overrideIds, ...defaultIds]);
  return [...all].sort();
}
