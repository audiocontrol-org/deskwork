/**
 * Legacy editorial-stage type guard for the dashboard render path.
 *
 * Phase 3 widened `Entry.currentStage` from the eight-stage `Stage`
 * union to an arbitrary non-empty string (lane-template-driven —
 * `packages/core/src/schema/entry.ts:164`). The dashboard's verb-chip
 * rendering helpers (`affordances.ts:verbsForStage` /
 * `affordances.ts:renderMenu`) still operate on the legacy `Stage`
 * union because the verb vocabulary they emit is the editorial
 * vocabulary specifically — iterate / approve / block / induct /
 * cancel / view / scrapbook. Non-editorial templates' verb
 * vocabularies become available through the template-aware verb
 * resolver landing in Phase 5 Task 5.2 (per
 * `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md`).
 *
 * Until that task lands, the safe behaviour at the verb-chip call
 * sites is: emit chips for entries whose `currentStage` is one of
 * the eight legacy editorial stages, and emit no chips for entries
 * outside that vocabulary (so non-editorial entries surface as
 * compact cards via `swimlane-entry-card.ts:renderEntryCard` —
 * already the existing dispatch in `swimlane-shell.ts:247`). The
 * guard below is the boundary check that narrows
 * `entry.currentStage: string` to the `Stage` union the dashboard's
 * editorial-vocabulary helpers expect.
 *
 * Per project rule "No fallbacks or mock data": this is not a
 * fallback — non-editorial-vocabulary entries already have a
 * separate, correct render path (the compact card). The guard
 * routes correctly; it doesn't substitute a degraded experience.
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
