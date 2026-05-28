/**
 * Per-lane data helpers for the multi-lane swimlane dashboard
 * (Phase 5 Task 5.1).
 *
 * Splits the legacy single-pipeline bucketing in `./data.ts` into a
 * lane-aware shape: every visible lane's entries are bucketed into
 * that lane's template-declared stages (linear + off-pipeline).
 *
 * Design notes:
 *
 *   - `loadLaneBuckets(projectRoot, entries)` bootstraps the default
 *     lane if missing (legacy projects without `.deskwork/lanes/`),
 *     enumerates every lane via `listLaneConfigs`, resolves each
 *     lane's template, and emits a `Map<laneId, LaneBucket>`. Map
 *     iteration order follows the operator-configured lane order
 *     (`listLaneConfigs` returns the basenames sorted; Task 5.4
 *     introduces explicit ordering via `.deskwork/lane-order.json`).
 *
 *   - Each `LaneBucket` carries the resolved `LaneConfig`,
 *     `StrictPipelineTemplate`, and an ordered map of
 *     `stage → Entry[]`. The map iterates `linearStages` first (in
 *     template order) then `offPipelineStages` (also in template
 *     order). Empty stages still get a Map entry so the renderer can
 *     emit empty columns uniformly.
 *
 *   - `entry.lane === undefined` is back-filled to the `default`
 *     lane id at bucket-time (per AMBIGUITY 4 — Phase 4's
 *     `migrateLaneMembership` should have already done this; the
 *     dashboard MUST NOT crash on undefined). A `console.warn` names
 *     the offending entry slug so the operator sees the data-integrity
 *     issue surface.
 *
 *   - Entries whose `currentStage` isn't in the resolved template's
 *     stage list go into an "unbucketed" array on the lane bucket.
 *     This is a data-integrity bug upstream (the entry's stage was
 *     never validated against its lane's template), but the dashboard
 *     surfaces it instead of crashing — the operator sees the count
 *     and can run doctor.
 */

import {
  bootstrapDefaultLaneIfMissing,
  listLaneConfigs,
  loadLaneConfig,
  type LaneConfig,
  type StrictLaneConfig,
} from '@deskwork/core/lanes';
import {
  loadPipelineTemplate,
  type StrictPipelineTemplate,
} from '@deskwork/core/pipelines';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';

/**
 * Lane id used as the fallback bucket for entries that arrive with
 * `entry.lane === undefined`. Mirrors `bootstrapDefaultLaneIfMissing`
 * (which creates a `default` lane bound to the editorial template).
 */
const DEFAULT_LANE_ID = 'default';

export interface LaneBucket {
  readonly lane: StrictLaneConfig;
  readonly template: StrictPipelineTemplate;
  /**
   * Stage → entries map. Iteration order:
   *   1. `template.linearStages` (in declared order).
   *   2. `template.offPipelineStages` (in declared order).
   * Empty stages still appear with a `[]` value so the renderer can
   * emit empty columns without re-walking the template.
   */
  readonly byStage: ReadonlyMap<string, readonly Entry[]>;
  /**
   * Entries whose `currentStage` is NOT in the resolved template's
   * stage list. Surfaces a data-integrity bug instead of silently
   * dropping the row — empty in healthy projects.
   */
  readonly unbucketed: readonly Entry[];
  /** Total entry count for the lane (sum of all stage buckets + unbucketed). */
  readonly entryCount: number;
}

/**
 * Result of `loadLaneBuckets` — one `LaneBucket` per resolved lane,
 * keyed by lane id, plus a flat list of entries that referenced a
 * lane id that doesn't exist on disk (treated as unrouted; surfaced
 * separately so the dashboard can warn).
 */
export interface LaneBucketsResult {
  /** Lane buckets, iteration order = lane order from `listLaneConfigs`. */
  readonly byLane: ReadonlyMap<string, LaneBucket>;
  /**
   * Entries whose `entry.lane` references a lane id that does NOT
   * exist in `byLane`. The dashboard renders nothing for these but
   * the count is available for diagnostics.
   */
  readonly unroutedEntries: readonly Entry[];
}

function buildEmptyStageMap(
  template: StrictPipelineTemplate,
): Map<string, Entry[]> {
  const out = new Map<string, Entry[]>();
  for (const stage of template.linearStages) out.set(stage, []);
  for (const stage of template.offPipelineStages) out.set(stage, []);
  return out;
}

function strictifyLane(lane: LaneConfig): StrictLaneConfig {
  return {
    id: lane.id,
    name: lane.name,
    pipelineTemplate: lane.pipelineTemplate,
    contentDir: lane.contentDir,
  };
}

/**
 * Resolve every lane config + its bound template. Bootstraps the
 * default lane if absent (legacy projects with a `.deskwork/config.
 * json` site block but no lane configs on disk). When the bootstrap
 * helper returns `no-config` AND no operator-authored lane configs
 * exist on disk, fall through to an in-memory default lane built
 * from the dashboard's `DeskworkConfig` argument. This second branch
 * keeps in-memory-only test harnesses (and a small set of legacy
 * adopters whose config lives only in CLI args) participating in the
 * lane-aware render path without forcing them to materialize the
 * config file. The lane is identical in shape to what the bootstrap
 * helper would have written; the difference is "only in memory, not
 * persisted." Per project rule, this isn't a silent fallback — the
 * dashboard's data layer always emits at least one lane, and the
 * lane's identity is documented (`id="default"`, template
 * `editorial`, `contentDir` from `config.sites[defaultSite]`).
 *
 * Throws on lane- or template-resolution failures (loud — a project
 * with broken lane configs should not silently render an empty bay).
 */
async function resolveAllLanes(
  projectRoot: string,
  config: DeskworkConfig,
): Promise<Map<string, LaneBucket>> {
  await bootstrapDefaultLaneIfMissing(projectRoot);
  const laneIds = listLaneConfigs(projectRoot);

  const byLane = new Map<string, LaneBucket>();
  for (const id of laneIds) {
    const lane = loadLaneConfig(id, projectRoot);
    const template = loadPipelineTemplate(lane.pipelineTemplate, projectRoot);
    const stageMap = buildEmptyStageMap(template);
    byLane.set(id, {
      lane: strictifyLane(lane),
      template,
      byStage: stageMap,
      unbucketed: [],
      entryCount: 0,
    });
  }

  if (byLane.size === 0) {
    // In-memory default-lane fallback for adopters whose
    // `.deskwork/config.json` lives only in the runtime call
    // arguments. Synthesizes the same `default` lane the
    // on-disk bootstrap would have produced; mirrors the loud
    // refusal contract — we only synthesize when the resolved
    // config has a usable `defaultSite` site block.
    const defaultSiteId = config.defaultSite;
    const site = config.sites[defaultSiteId];
    if (site !== undefined) {
      const template = loadPipelineTemplate('editorial', projectRoot);
      const lane: StrictLaneConfig = {
        id: DEFAULT_LANE_ID,
        name: 'Default',
        pipelineTemplate: 'editorial',
        contentDir: site.contentDir,
      };
      byLane.set(DEFAULT_LANE_ID, {
        lane,
        template,
        byStage: buildEmptyStageMap(template),
        unbucketed: [],
        entryCount: 0,
      });
    }
  }

  return byLane;
}

/**
 * Bucket every entry into its lane → stage bucket. Mutates the
 * `byStage` Maps in place (we built them mutable for this); returns a
 * tuple of `{ unbucketed-by-lane, unrouted }` for later aggregation.
 *
 * `entry.lane === undefined` routes to the `default` lane (per
 * AMBIGUITY 4). Emits a `console.warn` naming the entry slug so the
 * operator sees the data-integrity drift.
 */
function bucketIntoLanes(
  entries: readonly Entry[],
  byLane: Map<string, LaneBucket>,
): {
  unbucketedByLane: Map<string, Entry[]>;
  unrouted: Entry[];
} {
  const unbucketedByLane = new Map<string, Entry[]>();
  const unrouted: Entry[] = [];

  for (const entry of entries) {
    const laneId = entry.lane ?? DEFAULT_LANE_ID;
    if (entry.lane === undefined) {
      // Per AMBIGUITY 4: surface the legacy entry so the operator
      // sees the migration drift, but don't crash. Phase 4's
      // migrateLaneMembership should have back-filled this.
      // eslint-disable-next-line no-console
      console.warn(
        `dashboard: entry "${entry.slug}" (uuid=${entry.uuid}) ` +
          `has no \`lane\` field; routing to "${DEFAULT_LANE_ID}".`,
      );
    }
    const bucket = byLane.get(laneId);
    if (bucket === undefined) {
      // Entry's lane id doesn't exist on disk. Don't route to
      // default (would silently merge it into the wrong lane);
      // record as unrouted so callers can show a doctor-style
      // diagnostic.
      unrouted.push(entry);
      continue;
    }
    // The Map values are typed readonly in the public LaneBucket
    // shape, but we built them as plain `Entry[]` arrays via
    // `buildEmptyStageMap`. Cast-free narrowing: look up the
    // mutable array, append, and the outward-facing readonly type
    // is preserved by the eventual freeze in `loadLaneBuckets`.
    const stageBucket = bucket.byStage.get(entry.currentStage);
    if (stageBucket === undefined) {
      // Entry's currentStage isn't in the lane's template. Capture
      // as unbucketed so the count is visible.
      const arr = unbucketedByLane.get(laneId) ?? [];
      arr.push(entry);
      unbucketedByLane.set(laneId, arr);
      continue;
    }
    // stageBucket is the same Map value we put in via
    // `buildEmptyStageMap` — a mutable `Entry[]`. The readonly in
    // the public shape is a view-side narrowing, not a runtime
    // immutability claim.
    (stageBucket as Entry[]).push(entry);
  }

  return { unbucketedByLane, unrouted };
}

/**
 * Sort every stage's bucket by slug — hierarchical entries cluster
 * under their ancestor (display-only ordering; storage stays flat).
 * Mirrors the sort behavior of `bucketize` in `./data.ts`.
 */
function sortStageBuckets(byLane: Map<string, LaneBucket>): void {
  for (const bucket of byLane.values()) {
    for (const stageBucket of bucket.byStage.values()) {
      (stageBucket as Entry[]).sort((a, b) => a.slug.localeCompare(b.slug));
    }
  }
}

/**
 * Top-level: build per-lane buckets from a project root + the full
 * entry list. Internally invokes `bootstrapDefaultLaneIfMissing` so
 * legacy projects work without explicit operator setup.
 *
 * @throws when a lane config is malformed, a referenced pipeline
 *   template fails to resolve, or the bootstrap encounters a config
 *   integrity issue. The studio's `loadDashboardData` wrapper
 *   handles surfacing the error to the operator via the page-render
 *   error path.
 */
export async function loadLaneBuckets(
  projectRoot: string,
  config: DeskworkConfig,
  entries: readonly Entry[],
): Promise<LaneBucketsResult> {
  const byLane = await resolveAllLanes(projectRoot, config);
  const { unbucketedByLane, unrouted } = bucketIntoLanes(entries, byLane);
  sortStageBuckets(byLane);

  // Compose final buckets with unbucketed + entryCount filled in.
  // The Map mutation pattern keeps lane-order intact (insertion-order
  // preserved across the rebuild).
  const finalByLane = new Map<string, LaneBucket>();
  for (const [id, bucket] of byLane) {
    const unbucketed = unbucketedByLane.get(id) ?? [];
    let total = unbucketed.length;
    for (const stageBucket of bucket.byStage.values()) total += stageBucket.length;
    finalByLane.set(id, {
      lane: bucket.lane,
      template: bucket.template,
      byStage: bucket.byStage,
      unbucketed,
      entryCount: total,
    });
  }

  return {
    byLane: finalByLane,
    unroutedEntries: unrouted,
  };
}
