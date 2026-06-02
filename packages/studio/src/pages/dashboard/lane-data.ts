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
 *     `PipelineTemplate`, and an ordered map of
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
 *     stage list go into an "unbucketed" array on the lane bucket and
 *     are folded into `entryCount`. This is a data-integrity bug
 *     upstream (the entry's stage was never validated against its
 *     lane's template). Per AUDIT-20260530-25, the dashboard
 *     renderers (`swimlane-card.ts` + `swimlane-list-body.ts`) read
 *     `bucket.unbucketed` and emit an explicit `(unrecognized stage)`
 *     tail column / group per swim — mirroring the AUDIT-20260530-14
 *     fix at the canonical calendar SSOT and the AUDIT-20260529-37
 *     fix at the entry-review composed view — so the entries remain
 *     visible inline with their offending `currentStage` value and
 *     the swim-head count reconciles with the visible cards.
 */

import {
  bootstrapDefaultLaneIfMissing,
  listLaneConfigs,
  loadLaneConfig,
  type LaneConfig,
} from '@deskwork/core/lanes';
import {
  loadPipelineTemplate,
  type PipelineTemplate,
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
  readonly lane: LaneConfig;
  readonly template: PipelineTemplate;
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

/**
 * Internal mutable working type used while assembling lane buckets.
 * Public consumers see the readonly `LaneBucket` shape; this type
 * is module-private and exists so the bucketing pass can push into
 * `Entry[]` arrays without subverting the public read-only contract
 * via `as Type` casts (F3 code-quality fix).
 *
 * `LaneBucketBuilder` is converted to `LaneBucket` by `freezeBucket`
 * at the end of `loadLaneBuckets`. `Map<string, Entry[]>` is
 * structurally assignable to `ReadonlyMap<string, readonly Entry[]>`
 * because `Map` extends `ReadonlyMap` and `Entry[]` widens to
 * `readonly Entry[]`, so the freeze is a plain shape narrowing — no
 * cast required.
 */
interface LaneBucketBuilder {
  readonly lane: LaneConfig;
  readonly template: PipelineTemplate;
  readonly byStage: Map<string, Entry[]>;
  unbucketed: Entry[];
  entryCount: number;
}

function buildEmptyStageMap(
  template: PipelineTemplate,
): Map<string, Entry[]> {
  const out = new Map<string, Entry[]>();
  for (const stage of template.linearStages) out.set(stage, []);
  for (const stage of template.offPipelineStages) out.set(stage, []);
  return out;
}

/**
 * Project a loaded `LaneConfig` down to the runtime-contract fields
 * (id / name / pipelineTemplate / contentDir / archivedAt). Drops the
 * documentation-only `$rationale` field that the schema permits on
 * disk. Per AUDIT-20260530-08 the `Pick<>` alias is gone, so the
 * return type is `LaneConfig` itself; the function survives as a
 * runtime-side projection.
 */
function strictifyLane(lane: LaneConfig): LaneConfig {
  const projected: LaneConfig = {
    id: lane.id,
    name: lane.name,
    pipelineTemplate: lane.pipelineTemplate,
    contentDir: lane.contentDir,
  };
  if (lane.archivedAt !== undefined) {
    projected.archivedAt = lane.archivedAt;
  }
  return projected;
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
): Promise<Map<string, LaneBucketBuilder>> {
  await bootstrapDefaultLaneIfMissing(projectRoot);
  const laneIds = listLaneConfigs(projectRoot);

  const byLane = new Map<string, LaneBucketBuilder>();
  for (const id of laneIds) {
    const lane = loadLaneConfig(id, projectRoot);
    const template = loadPipelineTemplate(lane.pipelineTemplate, projectRoot);
    byLane.set(id, {
      lane: strictifyLane(lane),
      template,
      byStage: buildEmptyStageMap(template),
      unbucketed: [],
      entryCount: 0,
    });
  }

  if (byLane.size === 0) {
    // Soft empty-state path: when the runtime-config argument has
    // no usable `defaultSite` site block, we can't synthesize a
    // default lane on the fly. Returning an empty builder map lets
    // the downstream renderer in `swimlane-shell.ts` surface a
    // friendly empty state ("No lanes configured. Run /deskwork:
    // lane create ...") rather than crashing the dashboard. The
    // schema-loaded path is the loud refusal — `bootstrap
    // DefaultLaneIfMissing` throws on malformed config; this path
    // is the runtime-config fallback used by the test harness
    // `createApp({ projectRoot, config })` shape, where surfacing
    // the empty state is the desired UX.
    const defaultSiteId = config.defaultSite;
    const site = config.sites[defaultSiteId];
    if (site !== undefined) {
      const template = loadPipelineTemplate('editorial', projectRoot);
      const lane: LaneConfig = {
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
 * `byStage` Maps in place on the internal builders; returns a tuple
 * of `{ unbucketed-by-lane, unrouted }` for later aggregation.
 *
 * `entry.lane === undefined` routes to the `default` lane (per
 * AMBIGUITY 4). Emits a `console.warn` naming the entry slug so the
 * operator sees the data-integrity drift.
 */
function bucketIntoLanes(
  entries: readonly Entry[],
  byLane: Map<string, LaneBucketBuilder>,
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
    const stageBucket = bucket.byStage.get(entry.currentStage);
    if (stageBucket === undefined) {
      // Entry's currentStage isn't in the lane's template. Capture
      // as unbucketed so the count is visible.
      const arr = unbucketedByLane.get(laneId) ?? [];
      arr.push(entry);
      unbucketedByLane.set(laneId, arr);
      continue;
    }
    // `stageBucket` is the mutable `Entry[]` we built in
    // `buildEmptyStageMap`. No cast required — the builder's
    // `byStage` is typed as `Map<string, Entry[]>` precisely so the
    // public readonly contract is delivered by a separate freeze
    // step at the end of `loadLaneBuckets` (F3 code-quality fix).
    stageBucket.push(entry);
  }

  return { unbucketedByLane, unrouted };
}

/**
 * Sort every stage's bucket by slug — hierarchical entries cluster
 * under their ancestor (display-only ordering; storage stays flat).
 * Mirrors the sort behavior of `bucketize` in `./data.ts`. Operates
 * on the mutable builder bucket, so no cast is required.
 */
function sortStageBuckets(byLane: Map<string, LaneBucketBuilder>): void {
  for (const bucket of byLane.values()) {
    for (const stageBucket of bucket.byStage.values()) {
      stageBucket.sort((a, b) => a.slug.localeCompare(b.slug));
    }
  }
}

/**
 * Convert an internal `LaneBucketBuilder` to the public read-only
 * `LaneBucket` shape. `Map<string, Entry[]>` is structurally
 * assignable to `ReadonlyMap<string, readonly Entry[]>` (Map's
 * interface extends ReadonlyMap; `Entry[]` widens to `readonly
 * Entry[]`), so the conversion is a plain rebind — no `as Type`
 * cast required.
 */
function freezeBucket(
  builder: LaneBucketBuilder,
  unbucketed: readonly Entry[],
  entryCount: number,
): LaneBucket {
  return {
    lane: builder.lane,
    template: builder.template,
    byStage: builder.byStage,
    unbucketed,
    entryCount,
  };
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
  const builders = await resolveAllLanes(projectRoot, config);
  const { unbucketedByLane, unrouted } = bucketIntoLanes(entries, builders);
  sortStageBuckets(builders);

  // Freeze each builder into the public LaneBucket shape. Map
  // iteration preserves insertion order, so lane order set in
  // `resolveAllLanes` is preserved across this rebuild.
  const finalByLane = new Map<string, LaneBucket>();
  for (const [id, builder] of builders) {
    const unbucketed = unbucketedByLane.get(id) ?? [];
    let total = unbucketed.length;
    for (const stageBucket of builder.byStage.values()) total += stageBucket.length;
    finalByLane.set(id, freezeBucket(builder, unbucketed, total));
  }

  return {
    byLane: finalByLane,
    unroutedEntries: unrouted,
  };
}
