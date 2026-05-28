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

export function listLanes(
  projectRoot: string,
  opts: ListLanesOptions = {},
): ListedLane[] {
  const includeArchived = opts.includeArchived ?? false;
  const ids = listLaneConfigs(projectRoot, { includeArchived });
  return ids.map((id) => {
    const config = loadLaneConfig(id, projectRoot);
    const archived =
      typeof config.archivedAt === 'string' && config.archivedAt.length > 0;
    return { id, config, archived };
  });
}
