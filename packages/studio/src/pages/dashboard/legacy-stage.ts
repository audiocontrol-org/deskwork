/**
 * Legacy editorial-stage type guard.
 *
 * Phase 3 widened `Entry.currentStage` from the eight-stage `Stage`
 * union to an arbitrary non-empty string (lane-template-driven —
 * `packages/core/src/schema/entry.ts:164`). Phase 5 Task 5.2 lifted
 * the dashboard's verb-chip render paths to be template-aware, so
 * the swimlane renderer no longer consults this guard.
 *
 * The guard remains used by `dashboard/data.ts:bucketize` to populate
 * the legacy `byStage` map (the eight-stage union read view kept for
 * back-compat with v7 ordering tests + the eight-stage section
 * renderer for Shortform / Adjacent siblings). Non-editorial entries
 * are skipped in that map; their per-lane bucketing in
 * `loadLaneBuckets` is the authoritative routing.
 */

import type { Stage } from '@deskwork/core/schema/entry';

const LEGACY_EDITORIAL_STAGES: readonly Stage[] = [
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
 * Narrow a free-form stage string to the legacy editorial `Stage`
 * union. Returns false for non-editorial vocabulary (visual /
 * qa-plan / shortform templates), which callers handle by skipping
 * legacy-editorial-only chrome.
 */
export function isLegacyEditorialStage(s: string): s is Stage {
  return (LEGACY_EDITORIAL_STAGES as readonly string[]).includes(s);
}
