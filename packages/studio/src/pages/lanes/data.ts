/**
 * Data layer for the `/dev/lanes` studio page (Phase 6 Task 6.3).
 *
 * Loads two parallel views of the project's lane registry:
 *
 *   - **Active lanes:** every lane whose JSON does not carry an
 *     `archivedAt` field. The page shows these in the primary table.
 *   - **Archived lanes:** every lane whose JSON carries an `archivedAt`.
 *     The page shows these in a collapsed-by-default section.
 *
 * Per Phase 5 Task 5.4 the operator's preferred lane order lives
 * client-side (`localStorage` keyed by project + the `lane-order`
 * suffix). Server-side ordering is the alphabetical-by-id contract
 * `listLaneConfigs` returns; the client applies its preferred order
 * to the rendered table after hydration. This module does not read
 * any localStorage state — page-render is purely server-driven.
 *
 * Per-lane entry counts are computed from `readAllSidecars` + the
 * `entry.lane` field. Entries whose `lane` is missing or references
 * a lane that does not exist on disk are counted into an `unrouted`
 * tally surfaced separately. The dashboard already surfaces unrouted
 * entries (per `dashboard/lane-data.ts`); this page surfaces the
 * tally too so the operator sees the integrity signal here as well.
 *
 * Pipeline-template availability (used by the New Lane and Edit
 * forms) is sourced from `listAvailablePipelineTemplates` — the
 * union of plugin presets and project overrides. The page does NOT
 * validate each template at enumeration time (per the doctor
 * separation of concerns + the Task 6.4 follow-up note for inline
 * select-time errors).
 */

import {
  listLaneConfigs,
  loadLaneConfig,
  type LaneConfig,
} from '@deskwork/core/lanes';
import { listAvailablePipelineTemplates } from '@deskwork/core/pipelines';
import { readAllSidecars } from '@deskwork/core/sidecar';

/**
 * Per-lane summary surfaced to the renderer. The `archived` boolean
 * is derived from the `archivedAt` field being a non-empty string.
 */
export interface LaneRow {
  readonly id: string;
  readonly name: string;
  readonly pipelineTemplate: string;
  readonly contentDir: string;
  readonly archived: boolean;
  readonly archivedAt: string | null;
  readonly entryCount: number;
}

export interface LanesPageData {
  readonly active: readonly LaneRow[];
  readonly archived: readonly LaneRow[];
  /** Total number of entries on disk (independent of lane routing). */
  readonly totalEntries: number;
  /**
   * Entries whose `entry.lane` is undefined OR references a lane id
   * that does not exist in the active+archived set. Surfaced as a
   * diagnostic; the page renders the count next to the active-lane
   * tally so the operator sees the integrity drift here too.
   */
  readonly unroutedEntries: number;
  /** Sorted list of available pipeline-template ids (plugin + project). */
  readonly availableTemplates: readonly string[];
}

function laneRowFromConfig(
  id: string,
  config: LaneConfig,
  entryCount: number,
): LaneRow {
  const archivedAt =
    typeof config.archivedAt === 'string' && config.archivedAt.length > 0
      ? config.archivedAt
      : null;
  return {
    id,
    name: config.name,
    pipelineTemplate: config.pipelineTemplate,
    contentDir: config.contentDir,
    archived: archivedAt !== null,
    archivedAt,
    entryCount,
  };
}

/**
 * Compute per-lane entry counts from a flat sidecar list. Returns a
 * `Map<laneId, count>` plus an `unrouted` tally for entries whose
 * `lane` is undefined or references a lane id outside `knownLaneIds`.
 *
 * The function does NOT mutate input; it walks the entry list once.
 */
function countEntriesByLane(
  entries: ReadonlyArray<{ readonly lane?: string | undefined }>,
  knownLaneIds: ReadonlySet<string>,
): { byLane: ReadonlyMap<string, number>; unrouted: number } {
  const byLane = new Map<string, number>();
  let unrouted = 0;
  for (const entry of entries) {
    const laneId = entry.lane;
    if (laneId === undefined || !knownLaneIds.has(laneId)) {
      unrouted += 1;
      continue;
    }
    byLane.set(laneId, (byLane.get(laneId) ?? 0) + 1);
  }
  return { byLane, unrouted };
}

/**
 * Load the full lanes-page data view. Resolves every lane config
 * (active + archived) and joins per-lane entry counts. Throws if any
 * lane config is malformed — the studio's renderer surfaces the
 * error rather than swallowing it (per the project's no-fallback
 * rule).
 *
 * @param projectRoot - Absolute project root.
 */
export async function loadLanesPageData(
  projectRoot: string,
): Promise<LanesPageData> {
  const allIds = listLaneConfigs(projectRoot, { includeArchived: true });
  const known = new Set(allIds);

  const entries = await readAllSidecars(projectRoot);
  const { byLane, unrouted } = countEntriesByLane(entries, known);

  const active: LaneRow[] = [];
  const archived: LaneRow[] = [];
  for (const id of allIds) {
    const config = loadLaneConfig(id, projectRoot);
    const count = byLane.get(id) ?? 0;
    const row = laneRowFromConfig(id, config, count);
    if (row.archived) archived.push(row);
    else active.push(row);
  }

  const availableTemplates = listAvailablePipelineTemplates(projectRoot);

  return {
    active,
    archived,
    totalEntries: entries.length,
    unroutedEntries: unrouted,
    availableTemplates,
  };
}
