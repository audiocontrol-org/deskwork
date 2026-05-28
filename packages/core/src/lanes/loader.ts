/**
 * Lane config loader + enumeration.
 *
 * Two functions, both sync:
 *
 *   - `loadLaneConfig(id, projectRoot)` resolves a lane config by id
 *     from `<projectRoot>/.deskwork/lanes/<id>.json`. Refuses missing
 *     files with a clear error (no fallback — lanes are project-owned;
 *     unlike pipeline templates, there are no plugin defaults).
 *     Cross-validates that the lane's `pipelineTemplate` resolves via
 *     the Phase 2 template loader.
 *
 *   - `listLaneConfigs(projectRoot)` enumerates every `*.json` under
 *     `<projectRoot>/.deskwork/lanes/` and returns the basenames.
 *     Suitable for showing the operator a picker; callers resolve each
 *     id through `loadLaneConfig` to get the full config.
 *
 * Design notes:
 *
 *   - Sync I/O matches the pipeline template loader. Lane configs are
 *     small and read on cold paths.
 *
 *   - No caching. Same rationale as the pipeline template loader.
 *
 *   - The bootstrap helper for the legacy `sites.<defaultSite>` →
 *     `default` lane migration lives in `./bootstrap.ts`, NOT here.
 *     Mixing read-only resolution with side-effecting bootstrap would
 *     surprise callers; callers explicitly invoke
 *     `bootstrapDefaultLaneIfMissing` when appropriate.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { LaneConfigSchema, type LaneConfig } from './types.ts';
import { loadPipelineTemplate } from '../pipelines/loader.ts';

/**
 * Directory inside a project where lane configs live.
 */
export function lanesDir(projectRoot: string): string {
  return join(projectRoot, '.deskwork', 'lanes');
}

/**
 * Path to a specific lane config file under the project.
 */
export function laneConfigPath(projectRoot: string, id: string): string {
  return join(lanesDir(projectRoot), `${id}.json`);
}

/**
 * Read + parse + Zod-validate a single JSON file into a `LaneConfig`.
 * Throws with a descriptive message on every failure mode (file
 * missing, JSON parse error, schema violation, id mismatch with
 * filename).
 */
function readAndValidate(path: string, expectedId: string): LaneConfig {
  if (!existsSync(path)) {
    throw new Error(`Lane config file not found: ${path}`);
  }
  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Lane config at ${path} is not valid JSON: ${detail}`);
  }
  const result = LaneConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Lane config at ${path} failed Zod validation:\n${issues}`,
    );
  }
  if (result.data.id !== expectedId) {
    throw new Error(
      `Lane config at ${path} declares id "${result.data.id}" but was loaded as "${expectedId}" — `
      + `the JSON \`id\` field must equal the filename basename. `
      + `Either rename the file to "${result.data.id}.json", or change the JSON's id to "${expectedId}".`,
    );
  }
  return result.data;
}

/**
 * Load a lane config by id. Refuses missing files with a clear error
 * (no fallback). Cross-validates the referenced pipeline template at
 * load time — if the template doesn't resolve, the lane config is
 * effectively broken and the loader fails fast.
 *
 * @param id - The lane id (matches the JSON filename basename).
 * @param projectRoot - Absolute path to the project root.
 * @throws When the lane config file does not exist, the JSON fails to
 *   parse, Zod validation fails, the JSON's `id` field disagrees with
 *   the filename basename, or the referenced `pipelineTemplate` does
 *   not resolve.
 */
export function loadLaneConfig(id: string, projectRoot: string): LaneConfig {
  if (id.trim().length === 0) {
    throw new Error(
      `loadLaneConfig requires a non-empty id; received ${JSON.stringify(id)}`,
    );
  }
  const path = laneConfigPath(projectRoot, id);
  if (!existsSync(path)) {
    throw new Error(
      `Lane config "${id}" not found at ${path}. `
      + `Lane configs are project-owned and must be authored under .deskwork/lanes/. `
      + `(There are no plugin-default lanes; bootstrap a default lane via `
      + `bootstrapDefaultLaneIfMissing if migrating from a pre-graphical-entries project.)`,
    );
  }
  const lane = readAndValidate(path, id);

  // Cross-validate the pipeline template reference. Delegating to
  // loadPipelineTemplate lets its error message bubble up; we wrap it
  // with lane context so the operator sees BOTH the lane id and the
  // template id in the failure.
  try {
    loadPipelineTemplate(lane.pipelineTemplate, projectRoot);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Lane "${id}" at ${path} references pipelineTemplate "${lane.pipelineTemplate}" `
      + `which failed to resolve:\n${detail}`,
    );
  }

  return lane;
}

/**
 * Options accepted by `listLaneConfigs`.
 *
 * - `includeArchived` — when `false` (the default), lanes carrying a
 *   non-empty `archivedAt` field are filtered OUT of the returned
 *   list. When `true`, archived lanes appear alongside active ones.
 *
 * The default of `false` is intentional: prior to Phase 6 Task 6.1
 * archived lanes did not exist, so every existing call site (dashboard
 * renderer, calendar renderer) wants only active lanes. Callers that
 * genuinely want the full set (the `lane list --include-archived`
 * verb; doctor enumeration) opt in explicitly.
 */
export interface ListLaneConfigsOptions {
  readonly includeArchived?: boolean;
}

/**
 * Enumerate every lane config id under `<projectRoot>/.deskwork/lanes/`.
 * Missing directory is treated as empty — a project with no lanes
 * configured returns an empty array (the bootstrap helper handles the
 * legacy-default case explicitly; this function does not).
 *
 * The function does NOT validate any lane config — it just enumerates
 * what's on disk. A malformed lane JSON still appears in the list; the
 * operator finds out about the malformation at load time.
 *
 * Archived lanes (those whose JSON carries a non-empty `archivedAt`
 * field) are filtered out by default. Pass `{ includeArchived: true }`
 * to include them. The filter reads JSON and inspects the `archivedAt`
 * field directly — it does NOT validate the full lane config (a
 * malformed lane still appears in the list as before; the
 * archived-filter degrades gracefully to "not archived" for any lane
 * whose JSON fails to parse, mirroring the loader's read-only-on-
 * enumeration contract).
 *
 * @param projectRoot - Absolute path to the project root.
 * @param options - Optional behavior toggles; defaults documented on
 *   {@link ListLaneConfigsOptions}.
 */
export function listLaneConfigs(
  projectRoot: string,
  options: ListLaneConfigsOptions = {},
): string[] {
  const includeArchived = options.includeArchived ?? false;
  const dir = lanesDir(projectRoot);
  if (!existsSync(dir)) {
    return [];
  }
  const basenames = readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => basename(entry, '.json'))
    .sort();
  if (includeArchived) {
    return basenames;
  }
  return basenames.filter((id) => !isArchivedOnDisk(projectRoot, id));
}

/**
 * Inspect a lane's JSON file directly for the presence of a non-empty
 * `archivedAt` field. Used by `listLaneConfigs` to filter archived
 * lanes. Read-only: refuses to throw on malformed JSON (returns
 * `false` so the lane still appears in non-archived lists; the
 * malformation surfaces at `loadLaneConfig` time).
 */
function isArchivedOnDisk(projectRoot: string, id: string): boolean {
  const path = laneConfigPath(projectRoot, id);
  if (!existsSync(path)) {
    return false;
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return false;
    const archivedAt = Reflect.get(parsed, 'archivedAt');
    return typeof archivedAt === 'string' && archivedAt.length > 0;
  } catch {
    return false;
  }
}
