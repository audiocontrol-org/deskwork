/**
 * lane list — enumerate lane configs in the project.
 *
 * Phase 6 Task 6.1 (graphical-entries). Wraps `listLaneConfigs` and
 * loads each lane's metadata so the CLI handler can render id + name
 * + pipelineTemplate + contentDir + archived state without making N+1
 * calls to `loadLaneConfig` in the CLI layer.
 *
 * The `includeArchived` flag flows through to the loader. The result
 * preserves the loader's alphabetical-by-id ordering; the CLI handler
 * is responsible for any preferred-display-order overrides (e.g. the
 * `.deskwork/lane-order.json` lookup landed in Phase 5).
 *
 * AUDIT-20260530-57 (Task 0.33): per-id load failures are collected
 * into a `malformed: { id, error }[]` channel instead of propagating
 * the first failure as a throw. The loader's `listLaneConfigs`
 * deliberately tolerates corrupt JSON (its `isArchivedOnDisk` helper
 * returns `false` on parse errors so the enumeration still includes
 * the broken file). This operation honors that contract by surfacing
 * healthy lanes alongside a flagged-broken channel — a single
 * `broken.json` no longer aborts the enumeration and hides every
 * other lane from the operator.
 */

import { listLaneConfigs, loadLaneConfig } from '../loader.ts';
import type { LaneConfig } from '../types.ts';

export interface ListLanesOptions {
  /** Include archived lanes (`archivedAt` set). Defaults to `false`. */
  readonly includeArchived?: boolean;
}

export interface ListedLane {
  readonly id: string;
  readonly config: LaneConfig;
  readonly archived: boolean;
}

export interface MalformedLane {
  readonly id: string;
  readonly error: string;
}

export interface ListLanesResult {
  /** Lanes whose JSON parsed + validated; ordered by the loader's id sort. */
  readonly lanes: readonly ListedLane[];
  /**
   * Lanes whose JSON failed to load (parse error, schema violation,
   * missing-required-field). Each entry carries the id and the
   * underlying error message so CLI surfaces can render a flagged-
   * broken section without aborting the whole enumeration.
   */
  readonly malformed: readonly MalformedLane[];
}

export function listLanes(
  projectRoot: string,
  opts: ListLanesOptions = {},
): ListLanesResult {
  const includeArchived = opts.includeArchived ?? false;
  const ids = listLaneConfigs(projectRoot, { includeArchived });
  const lanes: ListedLane[] = [];
  const malformed: MalformedLane[] = [];
  for (const id of ids) {
    try {
      const config = loadLaneConfig(id, projectRoot);
      const archived =
        typeof config.archivedAt === 'string' && config.archivedAt.length > 0;
      lanes.push({ id, config, archived });
    } catch (err) {
      malformed.push({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { lanes, malformed };
}
