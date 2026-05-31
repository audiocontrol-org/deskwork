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
 *
 * Per Task 0.41 (closes AUDIT-20260530-66 / cross-model
 * AUDIT-BARRAGE-claude-P6-2), malformed lane configs DO NOT abort the
 * page render. Per-lane load failures are collected into a
 * `malformed: LaneErrorRow[]` channel and surfaced as inline error
 * rows + a top-of-page banner — mirroring the pipelines page's
 * `PipelineErrorRow` + `renderErrorBanner` pattern. This way a single
 * corrupt JSON cannot blind the operator to the healthy lanes (or
 * stop them from using the page to triage the broken one).
 */

import {
  listLaneConfigs,
  loadLaneConfig,
  type LaneConfig,
} from '@deskwork/core/lanes';
import { listAvailablePipelineTemplates } from '@deskwork/core/pipelines';
import { readAllSidecars } from '@deskwork/core/sidecar';
import { join } from 'node:path';

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

/**
 * Why a lane config failed to load when the loader was invoked.
 * Surfaced by the data layer so the renderer can show the operator a
 * row with an actionable next step (fix the JSON; rename the file;
 * fix the referenced pipeline template).
 *
 * `parse` — JSON.parse threw.
 * `zod` — schema validation rejected the parsed value.
 * `id-mismatch` — JSON's `id` field disagrees with the filename
 *   basename.
 * `pipeline-resolve` — the lane's `pipelineTemplate` reference does
 *   not resolve to a loadable template (loader's cross-validation
 *   step failed).
 * `missing` — file did not exist (should not happen for ids returned
 *   by the enumerator; included for completeness).
 * `unknown` — any other Error shape; the underlying message is
 *   preserved verbatim so the operator can see what the loader said.
 */
export type LaneLoadErrorKind =
  | 'parse'
  | 'zod'
  | 'id-mismatch'
  | 'pipeline-resolve'
  | 'missing'
  | 'unknown';

/**
 * Per-lane load-error record. The renderer maps these to error rows
 * in the table; the `path` names the file on disk the operator
 * should open, and `message` is the loader's verbatim diagnostic.
 */
export interface LaneLoadError {
  readonly kind: LaneLoadErrorKind;
  readonly path: string;
  readonly message: string;
}

/**
 * Per-lane error record (the lane id appeared in the enumerator but
 * `loadLaneConfig` threw). Mirrors `PipelineErrorRow` from the
 * pipelines-page data layer so the lanes page can render an
 * equivalent inline error row.
 */
export interface LaneErrorRow {
  readonly id: string;
  readonly error: LaneLoadError;
}

export interface LanesPageData {
  readonly active: readonly LaneRow[];
  readonly archived: readonly LaneRow[];
  /**
   * Lanes that failed to load. The renderer surfaces these as inline
   * error rows + a top-of-page banner. Mirrors the pipelines page's
   * `errors` channel. Empty list when every enumerated lane loaded
   * cleanly.
   */
  readonly malformed: readonly LaneErrorRow[];
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
 * Classify a thrown lane-loader error into a `LaneLoadErrorKind` so
 * the renderer can present a tailored hint. The loader's error
 * messages are stable (see `packages/core/src/lanes/loader.ts`'s
 * `readAndValidate` + `loadLaneConfig`), so substring matching
 * against those strings is a contract-level signal, not a brittle
 * parse. Mirrors `classifyLoadError` in the pipelines data layer.
 */
function classifyLaneLoadError(message: string): LaneLoadErrorKind {
  if (message.includes('is not valid JSON')) return 'parse';
  if (message.includes('failed Zod validation')) return 'zod';
  if (message.includes('declares id') && message.includes('but was loaded as')) {
    return 'id-mismatch';
  }
  if (
    message.includes('references pipelineTemplate')
    && message.includes('failed to resolve')
  ) {
    return 'pipeline-resolve';
  }
  if (message.includes('not found')) return 'missing';
  return 'unknown';
}

/**
 * On-disk path for a lane id under `<projectRoot>/.deskwork/lanes/`.
 * The lanes loader exposes `laneConfigPath` indirectly; reconstructing
 * the path locally keeps the data layer's dependency surface minimal
 * (no new core export needed for one path-join) and matches the
 * pipelines data layer's `pathForId` pattern.
 */
function laneJsonPath(projectRoot: string, id: string): string {
  return join(projectRoot, '.deskwork', 'lanes', `${id}.json`);
}

/**
 * Load the full lanes-page data view. Resolves every lane config
 * (active + archived) and joins per-lane entry counts. Per-lane
 * `loadLaneConfig` failures DO NOT abort the page render — they are
 * collected into the `malformed` channel so the renderer can show
 * inline error rows + a top-of-page banner. This mirrors the
 * pipelines page's posture: one corrupt JSON cannot blind the
 * operator to the healthy lanes (per AUDIT-20260530-66).
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
  const malformed: LaneErrorRow[] = [];
  for (const id of allIds) {
    let config: LaneConfig;
    try {
      config = loadLaneConfig(id, projectRoot);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      malformed.push({
        id,
        error: {
          kind: classifyLaneLoadError(message),
          path: laneJsonPath(projectRoot, id),
          message,
        },
      });
      continue;
    }
    const count = byLane.get(id) ?? 0;
    const row = laneRowFromConfig(id, config, count);
    if (row.archived) archived.push(row);
    else active.push(row);
  }

  const availableTemplates = listAvailablePipelineTemplates(projectRoot);

  return {
    active,
    archived,
    malformed,
    totalEntries: entries.length,
    unroutedEntries: unrouted,
    availableTemplates,
  };
}
