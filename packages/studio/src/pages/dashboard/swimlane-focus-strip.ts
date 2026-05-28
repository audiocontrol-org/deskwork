/**
 * Focus-chip strip renderer for the multi-lane swimlane dashboard
 * (Phase 5 Task 5.1).
 *
 * Emits the strip above the bay: an "All" chip plus one per-lane
 * focus chip. The strip operates as a toggle filter — clicking a
 * chip flips that lane between focused (full swimlane visible) and
 * un-focused (compact stub visible). Click handlers live in the
 * client at `plugins/deskwork-studio/public/src/dashboard/
 * swimlane.ts:bindFocusChips`.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import { laneGlyph } from './lane-glyph.ts';
import type { LaneRailRow } from './swimlane-rail.ts';

function renderFocusChip(row: LaneRailRow): RawHtml {
  const classes = row.inFocus ? 'focus-chip active' : 'focus-chip';
  return unsafe(html`
    <button class="${classes}" type="button" data-focus-chip="${row.id}"
      aria-pressed="${row.inFocus ? 'true' : 'false'}">
      <span class="fc-glyph" aria-hidden="true">${laneGlyph(row.templateId)}</span>
      <span class="fc-label">${row.name}</span>
      <span class="fc-count">${row.entryCount}</span>
    </button>`);
}

export function renderFocusStrip(
  laneRows: readonly LaneRailRow[],
  allActive: boolean,
): RawHtml {
  const chipsRaw = laneRows.map((r) => renderFocusChip(r).__raw).join('');
  const allClass = allActive ? 'focus-chip all active' : 'focus-chip all';
  return unsafe(html`
    <nav class="focus-strip" aria-label="Lane focus filter" data-focus-strip>
      <span class="strip-label">Focus</span>
      <button class="${allClass}" type="button" data-focus-chip-all
        aria-pressed="${allActive ? 'true' : 'false'}">
        <span class="fc-label">All</span>
        <span class="fc-count">${laneRows.length}</span>
      </button>
      <div class="strip-divider" aria-hidden="true"></div>
      ${unsafe(chipsRaw)}
    </nav>`);
}
