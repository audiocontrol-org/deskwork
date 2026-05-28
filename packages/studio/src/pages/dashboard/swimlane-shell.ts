/**
 * Multi-lane swimlane dashboard shell — Direction 3 "Press Bay" v11.
 *
 * Phase 5 Task 5.1 renders the bay-shell foundation:
 *   - Left lane-visibility rail (desktop) listing every lane with
 *     glyph + name + eye-toggle (visibility) + drag-stub.
 *   - Bay main column with: focus-chip strip + one `<article
 *     class="swim">` per focused lane + `<button class="swim-stub">`
 *     for visibility-on-but-focus-off lanes.
 *
 * Each swimlane's body renders a kanban-style `.stage-grid` with one
 * `.stage-col` per stage from the lane's template (linearStages then
 * offPipelineStages). The compact per-stage strip (`.swim-compact`)
 * is also emitted; CSS reveals it when the lane is `.collapsed`
 * (state added by Task 5.1A's chevron controller).
 *
 * What's deliberately NOT here (later-task slots only — empty, not
 * stubbed):
 *   - Lane-level collapse / per-stage collapse chevron handlers
 *     (Task 5.1A — markup carries an `<empty-slot>`-style comment
 *     where the chevron will land so 5.1A diff is additive).
 *   - Per-lane kanban ↔ list view toggle (Task 5.1B).
 *   - Per-lane `+ new` Compose chip (Task 5.1C).
 *   - Drag-to-reorder rail handler (Task 5.4).
 *   - Saveable focus presets + deep-link URL (Task 5.5).
 *
 * The markup leaves explicit `<!-- 5.1A slot -->` / `<!-- 5.1B
 * slot -->` / `<!-- 5.1C slot -->` HTML comments so the next
 * dispatch's diff is additive (drop in the affordance; no markup
 * needs removing).
 *
 * F4 split (Phase 5 Task 5.1 code-quality pass): the rail, focus-
 * strip, and per-lane swim/stub renderers live in sibling modules
 * (`./swimlane-rail.ts`, `./swimlane-focus-strip.ts`,
 * `./swimlane-card.ts`). This file is the orchestrator: parse the
 * URL focus param, compute the focus set, build the rail-row
 * metadata, and stitch the output together.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import { projectKeyHash } from './project-key.ts';
import { renderRail, type LaneRailRow } from './swimlane-rail.ts';
import { renderFocusStrip } from './swimlane-focus-strip.ts';
import { renderSwimlane, renderSwimStub } from './swimlane-card.ts';
import type { LaneBucket, LaneBucketsResult } from './lane-data.ts';

export interface SwimlaneShellInput {
  readonly lanes: LaneBucketsResult;
  readonly defaultSite: string;
  /**
   * Absolute project root path. The shell hashes it into a stable
   * 12-char token and emits it as `data-project-key` on the bay
   * shell so the client controller can namespace its localStorage
   * state per project (preventing cross-project key collisions when
   * two projects share a studio route).
   */
  readonly projectRoot: string;
  /**
   * URL `?focus=<csv>` value parsed from the request. When present,
   * takes precedence over localStorage (handled server-side: lanes
   * not in the focus set render as `.swim-stub`s; lanes in the set
   * render as full `.swim`s). When absent, server-side default is
   * "all visible lanes focused" — the client controller may later
   * override that via localStorage (post-DOMContentLoaded).
   */
  readonly focusFromUrl: readonly string[] | null;
}

/**
 * Parse a CSV `?focus=` parameter into a deduplicated lane-id list.
 * Empty values are dropped; whitespace trimmed. Returns null when
 * the input string is null OR empty after trimming (callers treat
 * null as "no URL override").
 */
export function parseFocusCsv(raw: string | null): readonly string[] | null {
  if (raw === null) return null;
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  // Dedupe while preserving first-seen order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (seen.has(part)) continue;
    seen.add(part);
    out.push(part);
  }
  return out;
}

/**
 * Decide which lanes are FOCUSED for the current render. Server-side
 * decisions:
 *   - `focusFromUrl !== null`: that list wins (any lane id NOT in the
 *     list renders as a stub; any id in the list AND present on disk
 *     renders as a full swimlane; any id in the list but NOT on disk
 *     is ignored).
 *   - `focusFromUrl === null`: every lane that exists on disk is
 *     focused by default. The client controller post-DOMContentLoaded
 *     may narrow this via localStorage; that's a client concern only.
 */
function computeFocus(
  laneIds: readonly string[],
  focusFromUrl: readonly string[] | null,
): { focused: Set<string>; urlDriven: boolean } {
  if (focusFromUrl === null) {
    return { focused: new Set(laneIds), urlDriven: false };
  }
  const focused = new Set<string>();
  for (const id of focusFromUrl) {
    if (laneIds.includes(id)) focused.add(id);
  }
  return { focused, urlDriven: true };
}

/**
 * Build the per-lane rail-row metadata. Note: for Task 5.1 all lanes
 * resolved by `loadLaneBuckets` are treated as `visible: true` —
 * persistent visibility-off is a client-side localStorage concern
 * Task 5.4 introduces (`.deskwork/lane-order.json` for project-wide
 * scope). The server still renders every lane; the client controller
 * adds the `is-hidden` class to lanes the operator has flipped off.
 */
function buildLaneRows(
  byLane: ReadonlyMap<string, LaneBucket>,
  focused: ReadonlySet<string>,
): readonly LaneRailRow[] {
  const out: LaneRailRow[] = [];
  for (const [id, bucket] of byLane) {
    out.push({
      id,
      name: bucket.lane.name,
      entryCount: bucket.entryCount,
      inFocus: focused.has(id),
      visible: true,
      templateId: bucket.template.id,
    });
  }
  return out;
}

function countTotal(lanes: LaneBucketsResult): number {
  let total = 0;
  for (const bucket of lanes.byLane.values()) total += bucket.entryCount;
  return total;
}

/**
 * Top-level renderer: emit the bay shell. Caller (dashboard.ts) wraps
 * this in `<main class="er-container">` siblings (header, shortform,
 * adjacent).
 *
 * Returns an empty-state markup when there are no lanes at all — by
 * the time this is called, `bootstrapDefaultLaneIfMissing` has fired
 * inside `loadLaneBuckets`, so a healthy project always has at least
 * the `default` lane. The empty branch exists for the truly
 * pathological case (no legacy config, no operator-created lanes) so
 * the dashboard renders a sane empty state instead of crashing.
 */
export function renderSwimlanesShell(input: SwimlaneShellInput): RawHtml {
  const { lanes, defaultSite, focusFromUrl, projectRoot } = input;
  const projectKey = projectKeyHash(projectRoot);
  const laneIds = Array.from(lanes.byLane.keys());
  if (laneIds.length === 0) {
    return unsafe(html`
      <section class="bay-shell bay-shell--empty" data-bay-shell-empty>
        <p class="bay-empty-message">
          No lanes configured. The default lane bootstrap requires a
          <code>.deskwork/config.json</code> with a
          <code>sites.&lt;defaultSite&gt;</code> block, or an operator-
          authored lane under <code>.deskwork/lanes/</code>.
        </p>
      </section>`);
  }

  const { focused, urlDriven } = computeFocus(laneIds, focusFromUrl);
  const laneRows = buildLaneRows(lanes.byLane, focused);
  const allActive = focused.size === laneIds.length;

  const railRaw = renderRail(laneRows, laneIds.length).__raw;
  const focusStripRaw = renderFocusStrip(laneRows, allActive).__raw;

  // Per AUDIT-20260528-02: render BOTH the swimlane and the stub for
  // every visibility-on lane so the client's focus toggle has both
  // DOM nodes to swap between. The CSS rule
  // `.swim.is-focus-hidden { display: none }` (and its newly-added
  // `.swim-stub.is-focus-hidden` sibling) decides which one shows.
  const bodyRaw = laneRows
    .map((row) => {
      const bucket = lanes.byLane.get(row.id);
      if (bucket === undefined) return '';
      const swimHidden = !row.inFocus;
      const stubHidden = row.inFocus;
      return (
        renderSwimlane(bucket, defaultSite, swimHidden).__raw
        + renderSwimStub(row, stubHidden).__raw
      );
    })
    .join('');

  // Per the mockup at line 1031, when the focus filter narrows the
  // visible set below the total, the bay-head meta prefixes a
  // `<span class="filter-active">Filtered · </span>` badge. The
  // badge is the operator-perceivable signal that some lanes are
  // suppressed; without it, "2 of 3 lanes shown" reads as a static
  // count rather than as a transient filter state.
  const isFiltered = focused.size < laneIds.length;
  const filteredBadge = isFiltered
    ? '<span class="filter-active">Filtered · </span>'
    : '';
  const unroutedPart =
    input.lanes.unroutedEntries.length === 0
      ? ''
      : `${input.lanes.unroutedEntries.length} unrouted · `;
  const metaRaw = `${filteredBadge}${focused.size} of ${laneIds.length} lanes shown · ${unroutedPart}${countTotal(lanes)} entries`;

  return unsafe(html`
    <section class="bay-shell" data-bay-shell
      data-project-key="${projectKey}"
      data-focus-url-driven="${urlDriven ? 'true' : 'false'}">
      ${unsafe(railRaw)}
      <main class="bay" data-bay>
        <div class="bay-head">
          <div class="bh-row-1">
            <span>The Press Bay</span>
            <span class="bh-meta">${unsafe(metaRaw)}</span>
          </div>
          ${unsafe(focusStripRaw)}
        </div>
        ${unsafe(bodyRaw)}
      </main>
    </section>`);
}
