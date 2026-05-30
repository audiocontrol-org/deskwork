/**
 * Dashboard data loader. Reads every sidecar under
 * `<projectRoot>/.deskwork/entries/*.json` and groups them by
 * `currentStage` so the renderer can iterate the eight canonical
 * stage sections without re-walking the disk per stage.
 *
 * v7 architecture (Step 2.2.9 — studio-mobile-first feature): also
 * reads open shortform workflows from the review-pipeline store and
 * groups them by `Platform`. Per DESIGN-STANDARDS.md § Desk
 * information architecture, the Desk absorbs the Shortform-by-platform
 * view as its second section (sibling of the longform pipeline). The
 * v0.21 platform display order is LinkedIn → Reddit → YouTube →
 * Instagram (insertion order = display order; verified against the
 * v7 mockup at desk-states-v7.html:632-655).
 */

import { readAllSidecars } from '@deskwork/core/sidecar';
import type { Entry, Stage } from '@deskwork/core/schema/entry';
import { listOpen } from '@deskwork/core/review/pipeline';
import type { DraftWorkflowItem } from '@deskwork/core/review/types';
import type { Platform } from '@deskwork/core/types';
import type { DeskworkConfig } from '@deskwork/core/config';
import { isPopulatedGroupEntry } from '@deskwork/core/groups';
import { loadLaneBuckets, type LaneBucketsResult } from './lane-data.ts';
import { isLegacyEditorialStage } from './legacy-stage.ts';

/**
 * The eight canonical stages, in display order. Linear pipeline
 * (Ideas → Published) first, then off-pipeline (Blocked, Cancelled)
 * pinned at the bottom so the visual flow reads top-down through the
 * normal lifecycle.
 */
export const DASHBOARD_STAGE_ORDER: readonly Stage[] = [
  'Ideas',
  'Planned',
  'Outlining',
  'Drafting',
  'Final',
  'Published',
  'Blocked',
  'Cancelled',
] as const;

/**
 * Display order for shortform platform tiles. Verified against the v7
 * mockup at desk-states-v7.html:632-655: LinkedIn → Reddit → YouTube →
 * Instagram. Used as the insertion order for the `shortformByPlatform`
 * Map so iteration order matches display order.
 */
export const DASHBOARD_PLATFORM_ORDER: readonly Platform[] = [
  'linkedin',
  'reddit',
  'youtube',
  'instagram',
] as const;

export interface DashboardData {
  readonly entries: readonly Entry[];
  readonly byStage: ReadonlyMap<Stage, readonly Entry[]>;
  readonly shortformWorkflows: readonly DraftWorkflowItem[];
  readonly shortformByPlatform: ReadonlyMap<Platform, readonly DraftWorkflowItem[]>;
  /**
   * Per-lane buckets for the multi-lane swimlane shell (Phase 5
   * Task 5.1). `byLane` iteration order = lane order from
   * `listLaneConfigs`. Entries are bucketed against the lane's
   * resolved pipeline template, not the legacy eight-stage union.
   * `byStage` above is kept as a back-compat read view for code that
   * still iterates the legacy union (the v7 ordering test + the
   * eight-stage section renderer for Shortform/Adjacent siblings).
   */
  readonly lanes: LaneBucketsResult;
  /**
   * Reverse-lookup index: member UUID → ordered list of parent group
   * entries. Built once per dashboard render so per-row renderers can
   * surface the "Member of:" pull-tab without scanning every entry per
   * row (Phase 7 Task 7.3 — Direction 1 picked).
   *
   * Only populated groups (`isPopulatedGroupEntry`) contribute; entries
   * that aren't members of any group have NO entry in this map (the
   * row renderer treats absent + empty as the same "render no tab"
   * signal).
   */
  readonly parentsByMemberUuid: ReadonlyMap<string, readonly Entry[]>;
}

function bucketize(entries: readonly Entry[]): Map<Stage, Entry[]> {
  const out = new Map<Stage, Entry[]>();
  for (const stage of DASHBOARD_STAGE_ORDER) out.set(stage, []);
  for (const e of entries) {
    // Per AUDIT-20260528-01: `byStage` is the back-compat read view
    // keyed by the legacy editorial `Stage` union. Entries whose
    // `currentStage` is not a legacy editorial stage belong to a
    // non-editorial lane template and are surfaced through the
    // `lanes` (LaneBucketsResult) read path below. Skip them here so
    // the legacy view stays type-clean; their per-lane bucketing in
    // `loadLaneBuckets` is the authoritative routing.
    if (!isLegacyEditorialStage(e.currentStage)) continue;
    const bucket = out.get(e.currentStage);
    if (bucket !== undefined) bucket.push(e);
  }
  // Sort each bucket by slug — hierarchical entries cluster under
  // their ancestor (display-only ordering; storage stays flat).
  for (const bucket of out.values()) {
    bucket.sort((a, b) => a.slug.localeCompare(b.slug));
  }
  return out;
}

/**
 * Load open shortform workflows, sorted by `updatedAt` descending.
 * Ported from the pre-v7 `loadOpenShortform` helper in pages/shortform.ts
 * (preserved verbatim there until Step 2.2.10 retires that page).
 */
function loadOpenShortform(
  projectRoot: string,
  config: DeskworkConfig,
): DraftWorkflowItem[] {
  const open: DraftWorkflowItem[] = [];
  for (const w of listOpen(projectRoot, config)) {
    if (w.contentKind === 'shortform') open.push(w);
  }
  open.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return open;
}

/**
 * Bucket shortform workflows by platform. Insertion order matches
 * `DASHBOARD_PLATFORM_ORDER` — even empty platforms get a Map entry so
 * the renderer can iterate the four canonical tiles uniformly.
 *
 * Throws on a workflow whose `platform` is undefined. Per project rule
 * "Never implement fallbacks or use mock data outside of test code" — a
 * shortform workflow without a platform is a data-integrity bug
 * upstream, not a case to silently drop. Throwing surfaces the bug;
 * silent-drop would hide missing-from-the-Desk rows behind a count that
 * disagrees with the workflow store.
 */
/** @internal — exported only for testability of the throw contract. */
export function bucketizeShortform(
  workflows: readonly DraftWorkflowItem[],
): Map<Platform, DraftWorkflowItem[]> {
  const out = new Map<Platform, DraftWorkflowItem[]>();
  for (const platform of DASHBOARD_PLATFORM_ORDER) out.set(platform, []);
  for (const w of workflows) {
    if (w.platform === undefined) {
      throw new Error(
        `Shortform workflow "${w.id}" (slug "${w.slug}") has no platform — ` +
          `the Desk cannot bucket it. This is a data-integrity bug; ` +
          `every shortform workflow must carry a platform per ` +
          `@deskwork/core/review/types DraftWorkflowItem.`,
      );
    }
    const bucket = out.get(w.platform);
    if (bucket !== undefined) bucket.push(w);
  }
  return out;
}

/**
 * Build the member→parents reverse-lookup index from the loaded
 * sidecar set (Phase 7 Task 7.3 Step 7.3.3). One pass over `entries`:
 * for every populated group, push its sidecar into the per-member
 * accumulator. Iteration order of the resulting Map's values is the
 * order in which parents were encountered (groups are scanned in
 * sidecar-load order); operators don't rely on this ordering yet
 * (no spec calls for a "primary parent" notion), so the encounter
 * order is the canonical surface order.
 */
function buildParentsIndex(
  entries: readonly Entry[],
): ReadonlyMap<string, readonly Entry[]> {
  const index = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (!isPopulatedGroupEntry(entry)) continue;
    const members = entry.members ?? [];
    for (const memberUuid of members) {
      const arr = index.get(memberUuid);
      if (arr === undefined) {
        index.set(memberUuid, [entry]);
      } else {
        arr.push(entry);
      }
    }
  }
  return index;
}

export async function loadDashboardData(
  projectRoot: string,
  config: DeskworkConfig,
): Promise<DashboardData> {
  const entries = await readAllSidecars(projectRoot);
  const byStage = bucketize(entries);
  const shortformWorkflows = loadOpenShortform(projectRoot, config);
  const shortformByPlatform = bucketizeShortform(shortformWorkflows);
  // Phase 5 Task 5.1 Step 5.1.1: also bucket entries per lane.
  // bootstrapDefaultLaneIfMissing fires inside loadLaneBuckets so
  // legacy projects without `.deskwork/lanes/` participate in the
  // new model without explicit operator setup.
  const lanes = await loadLaneBuckets(projectRoot, config, entries);
  const parentsByMemberUuid = buildParentsIndex(entries);
  return {
    entries,
    byStage,
    shortformWorkflows,
    shortformByPlatform,
    lanes,
    parentsByMemberUuid,
  };
}
