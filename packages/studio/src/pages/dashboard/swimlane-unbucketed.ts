/**
 * Per-swim unbucketed-tail renderers (AUDIT-20260530-25) +
 * per-row classify-throw fallback (AUDIT-20260530-37).
 *
 * Mirrors the AUDIT-20260530-14 fix at the canonical calendar SSOT
 * (`packages/core/src/calendar/render.ts`) and the AUDIT-20260529-37
 * fix at the entry-review composed view
 * (`packages/studio/src/pages/entry-review/members-section.ts`). Both
 * precedents surface stage-not-in-template entries as an explicit
 * `(unrecognized stage)` tail so the entries remain visible inline
 * with the operator's diagnostic context (slug + title + offending
 * `currentStage`).
 *
 * Pre-fix on the dashboard surface, `loadLaneBuckets` captured
 * out-of-template entries into `bucket.unbucketed` AND folded them
 * into `bucket.entryCount`, while neither `renderSwimlane` (kanban
 * grid) nor `renderListBody` (list view) read from `bucket.unbucketed`.
 * Result: every count display reads N entries while only N-K cards
 * render. This module supplies the tail-section renderers consumed
 * by both surfaces so the count and the visible cards reconcile.
 *
 * The kanban tail (`renderUnbucketedStageCol`) emits a trailing
 * `.stage-col.is-unbucketed` column. The list-body tail
 * (`renderUnbucketedListGroup`) emits a trailing `.lb-group.is-unbucketed`
 * group. Both surfaces show each entry's raw `currentStage` value
 * inline so the operator can diagnose the routing drift without
 * leaving the dashboard.
 *
 * Per AUDIT-20260530-37 — `renderClassifyFallbackRow` is the
 * defense-in-depth analogue used by `renderStageCol`'s
 * `entries.map(renderRow)` try/catch boundary. The two paths surface
 * DIFFERENT drift modes through related-but-distinct chrome:
 *
 *   - `.er-row-shell--unbucketed` (AUDIT-25): the data layer
 *     (`bucketIntoLanes`) already routed the entry away from
 *     `byStage` into `bucket.unbucketed`; the entry lands here via
 *     the tail-column renderer.
 *   - `.er-row-shell--classify-fallback` (AUDIT-37): the data layer
 *     routed the entry into `byStage` (its `currentStage` matched
 *     the bucket key), but the deeper `classifyStage` call inside
 *     `renderRow` still threw — drift between the two
 *     classifications (or a malformed template reaching the
 *     renderer). The entry lands here via the try/catch in
 *     `renderStageCol`'s map, keeping the rest of the column
 *     intact.
 *
 * Both shapes keep the operator's identifying metadata + a link to
 * the review surface and surface the offending `currentStage` value
 * inline so the operator can diagnose without leaving the page.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import { entryRowLinkMeta } from './entry-link-meta.ts';
import type { Entry } from '@deskwork/core/schema/entry';

/**
 * Glyph used to mark the unbucketed tail in both surfaces. Mirrors
 * the `⊘` glyph the entry-review composed view's unbucketed tail
 * uses (`members-section.ts:203`) for visual continuity across
 * surfaces that surface routing-drift entries.
 */
const UNBUCKETED_GLYPH = '⊘';

const UNBUCKETED_STAGE_LABEL = '(unrecognized stage)';

/**
 * Render one unbucketed entry as a self-contained kanban row. The
 * standard `renderRow` is NOT reused: it dispatches into
 * `renderRowDrawer` → `verbsForStage` which throws on any stage not in
 * the lane's template (per the no-fallback rule). Unbucketed entries
 * are by definition stage-not-in-template, so there is no valid verb
 * dispatch — the row surfaces the entry's identifying metadata + a
 * link to the review surface where the operator can repair the stage.
 *
 * The row carries the same `data-row-shell` + `data-uuid` + `data-slug`
 * + `data-stage` attributes the standard row exposes so existing
 * filter probes and selectors continue to resolve.
 */
function renderUnbucketedKanbanRow(entry: Entry): RawHtml {
  const { reviewLink, search } = entryRowLinkMeta(entry);
  return unsafe(html`<div class="er-row-shell er-row-shell--unbucketed" data-row-shell data-search="${search}"
      data-stage="${entry.currentStage}"
      data-uuid="${entry.uuid}" data-slug="${entry.slug}">
      <div class="er-row-fg er-calendar-row">
        <div class="er-calendar-body">
          <span class="er-row-slug"><a href="${reviewLink}"
            title="open the review surface (entry's currentStage is not in this lane's template)">${entry.slug}</a></span>
          <span class="er-calendar-title">${entry.title}</span>
          <span class="er-row-unbucketed-stage" data-unbucketed-current-stage="${entry.currentStage}">stage: ${entry.currentStage}</span>
        </div>
      </div>
    </div>`);
}

/**
 * Kanban-surface unbucketed tail. Renders a trailing `.stage-col`
 * column carrying `.is-unbucketed`; each entry uses
 * `renderUnbucketedKanbanRow` rather than the standard `renderRow`
 * because the standard path throws on stages not in the lane's
 * template (`classifyStage` in `affordances.ts`).
 *
 * Returns the empty string (as `RawHtml`) when there are no unbucketed
 * entries, so callers can append unconditionally.
 */
export function renderUnbucketedStageCol(
  laneId: string,
  unbucketed: readonly Entry[],
): RawHtml {
  if (unbucketed.length === 0) return unsafe('');

  const laneIdSlug = laneId.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const stageId = `lane-${laneIdSlug}-stage-unbucketed`;

  const rowsRaw = unbucketed
    .map((entry) => renderUnbucketedKanbanRow(entry).__raw)
    .join('');

  return unsafe(html`
    <section class="stage-col is-unbucketed"
      id="${stageId}"
      data-stage-col="unbucketed"
      data-stage-section="unbucketed"
      data-unbucketed>
      <div class="stage-head">
        <span class="stage-glyph" aria-hidden="true">${UNBUCKETED_GLYPH}</span>
        <span class="stage-name">${UNBUCKETED_STAGE_LABEL}</span>
        <span class="stage-count">${unbucketed.length}</span>
      </div>
      ${unsafe(rowsRaw)}
    </section>`);
}

/**
 * Compact-strip unbucketed cell (AUDIT-20260531-01). Renders a trailing
 * `.sc-stage.is-unbucketed` cell appended to the per-swim
 * `.swim-compact` strip (revealed by CSS when the lane is `.collapsed`).
 * Mirrors the structure of the regular compact cells emitted by
 * `renderSwimCompact` (`.sc-stage` > `.sc-name` + `.sc-count`) so the
 * existing flex layout (`dashboard-swimlane-shell.css`) handles the
 * trailing cell with no template changes.
 *
 * Mirrors the AUDIT-20260530-25 precedent on the two other dashboard
 * surfaces — `renderUnbucketedStageCol` (kanban grid) and
 * `renderUnbucketedListGroup` (list body) — which already reconcile
 * `bucket.unbucketed` against the swim-head's `quick-meta` count.
 * Pre-fix, the collapsed compact strip read `entryCount - unbucketed.length`
 * while the swim-head's `${entryCount} entries` text included the
 * unbucketed entries; this cell closes that reconciliation gap.
 *
 * Returns the empty string (as `RawHtml`) when there are no unbucketed
 * entries, so callers can append unconditionally.
 */
export function renderUnbucketedCompactCell(
  unbucketed: readonly Entry[],
): RawHtml {
  if (unbucketed.length === 0) return unsafe('');

  return unsafe(html`
    <div class="sc-stage is-unbucketed" data-sc-stage="unbucketed">
      <span class="sc-glyph" aria-hidden="true">${UNBUCKETED_GLYPH}</span>
      <span class="sc-name">${UNBUCKETED_STAGE_LABEL}</span>
      <span class="sc-count">${unbucketed.length}</span>
    </div>`);
}

/**
 * List-surface unbucketed tail. Renders a trailing `.lb-group` group
 * carrying `.is-unbucketed`; each entry uses the same `.lb-row` chrome
 * the list view emits for template-bucketed entries, with the
 * offending `currentStage` substituted into the `.lb-state` slot so
 * the row is operator-diagnosable inline.
 *
 * Returns the empty string (as `RawHtml`) when there are no unbucketed
 * entries.
 */
export function renderUnbucketedListGroup(
  laneId: string,
  unbucketed: readonly Entry[],
): RawHtml {
  if (unbucketed.length === 0) return unsafe('');
  void laneId;

  const rowsRaw = unbucketed
    .map((entry) => {
      const { reviewLink, search } = entryRowLinkMeta(entry);
      return html`<a class="lb-row lb-row--unbucketed" href="${reviewLink}"
        data-row-shell data-search="${search}"
        data-stage="${entry.currentStage}"
        data-uuid="${entry.uuid}" data-slug="${entry.slug}"
        title="open the review surface (entry's currentStage is not in this lane's template)">
        <span class="lb-title">${entry.title}</span>
        <span class="lb-version">${entry.slug}</span>
        <span class="lb-state" data-unbucketed-current-stage="${entry.currentStage}">stage: ${entry.currentStage}</span>
        <span class="lb-overflow" aria-hidden="true"
          data-lb-overflow="${entry.uuid}">⋮</span>
      </a>`;
    })
    .join('');

  return unsafe(html`
    <div class="lb-group is-unbucketed"
      data-lb-group="unbucketed"
      data-unbucketed>
      <div class="lb-group-head">
        <span class="lb-glyph" aria-hidden="true">${UNBUCKETED_GLYPH}</span>
        <span class="lb-name">${UNBUCKETED_STAGE_LABEL}</span>
        <span class="lb-count">${unbucketed.length}</span>
      </div>
      ${unsafe(rowsRaw)}
    </div>`);
}

/**
 * Per-row fallback for the AUDIT-20260530-37 defense-in-depth catch
 * in `renderStageCol`. When `renderRow` throws — most commonly via
 * `classifyStage` rejecting an `entry.currentStage` value not in the
 * resolved template's `linearStages` + `offPipelineStages` (drift
 * between `bucketIntoLanes`'s `byStage.get(stage)` lookup shape and
 * `classifyStage`'s indexOf-based lookup, or a malformed template
 * reaching the renderer) — this helper emits a self-contained row
 * that mirrors `renderUnbucketedKanbanRow`'s shape but carries a
 * distinct `.er-row-shell--classify-fallback` marker class + a
 * `data-classify-fallback-stage` carrier. The marker class lets the
 * operator distinguish "stage drift caught at bucketize" (.er-row-
 * shell--unbucketed via the tail column) from "verb-dispatch threw
 * mid-render" (this fallback inline in the bucket column).
 *
 * Like `renderUnbucketedKanbanRow`, this skips `renderRowActions` /
 * `renderRowDrawer` / `renderRowMenu` entirely — those dispatch
 * through `verbsForStage` which is the source of the throw being
 * caught, so re-entering them would re-trigger the bug.
 */
export function renderClassifyFallbackRow(entry: Entry, index: number): RawHtml {
  const { reviewLink, search } = entryRowLinkMeta(entry);
  return unsafe(html`<div class="er-row-shell er-row-shell--classify-fallback" data-row-shell data-search="${search}"
      data-stage="${entry.currentStage}"
      data-classify-fallback-stage="${entry.currentStage}"
      data-uuid="${entry.uuid}" data-slug="${entry.slug}">
      <div class="er-row-fg er-calendar-row">
        <span class="er-row-num">№ ${String(index + 1).padStart(2, '0')}</span>
        <div class="er-calendar-body">
          <span class="er-row-slug"><a href="${reviewLink}"
            title="open the review surface (entry's currentStage threw on classifyStage)">${entry.slug}</a></span>
          <span class="er-calendar-title">${entry.title}</span>
          <span class="er-row-unbucketed-stage">stage: ${entry.currentStage} (unrecognized — verb-dispatch failed)</span>
        </div>
      </div>
    </div>`);
}
