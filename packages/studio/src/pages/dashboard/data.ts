/**
 * Dashboard data loader. Reads every sidecar under
 * `<projectRoot>/.deskwork/entries/*.json` and groups them by
 * `currentStage` so the renderer can iterate the eight canonical
 * stage sections without re-walking the disk per stage.
 *
 * Pipeline-redesign Task 34. Replaces the legacy
 * `loadDashboardData` (calendar.md + workflow store) with a
 * sidecar-only reader.
 */

import { readAllSidecars } from '@deskwork/core/sidecar';
import type { Entry, Stage } from '@deskwork/core/schema/entry';

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

export interface DashboardData {
  readonly entries: readonly Entry[];
  readonly byStage: ReadonlyMap<Stage, readonly Entry[]>;
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

export async function loadDashboardData(projectRoot: string): Promise<DashboardData> {
  const entries = await readAllSidecars(projectRoot);
  const byStage = bucketize(entries);
  return { entries, byStage };
}
