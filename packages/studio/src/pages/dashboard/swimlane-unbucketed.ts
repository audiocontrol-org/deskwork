/**
 * Per-swim unbucketed-tail renderers (AUDIT-20260530-25).
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
