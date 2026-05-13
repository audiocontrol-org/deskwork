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
}

function bucketize(entries: readonly Entry[]): Map<Stage, Entry[]> {
  const out = new Map<Stage, Entry[]>();
  for (const stage of DASHBOARD_STAGE_ORDER) out.set(stage, []);
  for (const e of entries) {
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
 * the renderer can iterate the four canonical tiles uniformly. Workflows
 * whose `platform` is undefined (legacy data without the field set) are
 * dropped on the floor; the renderer's contract is "platform-keyed
 * tiles" and unkeyed workflows have no tile to live under.
 */
function bucketizeShortform(
  workflows: readonly DraftWorkflowItem[],
): Map<Platform, DraftWorkflowItem[]> {
  const out = new Map<Platform, DraftWorkflowItem[]>();
  for (const platform of DASHBOARD_PLATFORM_ORDER) out.set(platform, []);
  for (const w of workflows) {
    if (w.platform === undefined) continue;
    const bucket = out.get(w.platform);
    if (bucket !== undefined) bucket.push(w);
  }
  return out;
}

export async function loadDashboardData(
  projectRoot: string,
  config: DeskworkConfig,
): Promise<DashboardData> {
  const entries = await readAllSidecars(projectRoot);
  const byStage = bucketize(entries);
  const shortformWorkflows = loadOpenShortform(projectRoot, config);
  const shortformByPlatform = bucketizeShortform(shortformWorkflows);
  return { entries, byStage, shortformWorkflows, shortformByPlatform };
}
