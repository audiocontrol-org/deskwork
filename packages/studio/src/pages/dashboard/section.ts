/**
 * Single-stage section renderer.
 *
 * Each of the eight stage sections (plus the Distribution placeholder)
 * renders with a section heading (stage name + entry count) and either
 * a list of rows or an empty-state placeholder. Each row carries the
 * entry's slug, title, updated-at timestamp, and stage-gated verb
 * buttons. Per DESKWORK-STATE-MACHINE.md Commandment III, rows do NOT
 * surface iteration counts or reviewState — those were retired in
 * v0.19 along with the legacy reviewState concept.
 *
 * On mobile, each section is fronted by a collapsible tile (see
 * `renderStageTile`); on desktop the tiles are display:none and the
 * `<h2 class="er-section-head">` heading carries the stage name.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { Entry, Stage } from '@deskwork/core/schema/entry';
import { renderRowActions, renderRowDrawer, renderRowMenu } from './affordances.ts';

const STAGE_ORNAMENTS: Record<Stage, string> = {
  Ideas: '◇',
  Planned: '§',
  Outlining: '⊹',
  Drafting: '✎',
  Final: '※',
  Published: '✓',
  Blocked: '⊘',
  Cancelled: '✗',
};

const STAGE_EMPTY_MESSAGES: Record<Stage, string> = {
  Ideas: 'No open ideas. Run /deskwork:add to capture one.',
  Planned: 'Nothing planned. /deskwork:approve <slug> to graduate an idea.',
  Outlining: 'Nothing in outlining.',
  Drafting: 'No posts in drafting.',
  Final: 'Nothing in final review.',
  Published: 'No published posts yet.',
  Blocked: 'Nothing blocked.',
  Cancelled: 'No cancelled entries.',
};

/**
 * Render one entry as a single dashboard row. Carries inline:
 *   - slug (linked to the review surface)
 *   - title
 *   - updatedAt timestamp
 *   - per-stage action buttons
 *
 * Per DESKWORK-STATE-MACHINE.md (v5): revisions (the iteration counter)
 * are bookkeeping and do NOT surface in routine UI. The previous
 * "iteration: N" inline display was a violation — operators see
 * revisions only via the View History surface and revert flows.
 * reviewState badges are likewise retired (Commandment III).
 */
export function renderRow(entry: Entry, index: number, defaultSite: string): RawHtml {
  const reviewLink = `/dev/editorial-review/entry/${entry.uuid}`;
  const search = [entry.slug, entry.title, entry.keywords.join(' ')].join(' ').toLowerCase();
  // Hierarchical entries (slugs containing `/`) get a visual indent
  // marker the CSS layer reads. Storage stays flat; this is display-only.
  const depth = entry.slug.split('/').length - 1;
  const depthAttrs =
    depth > 0
      ? unsafe(html` data-depth="${depth}" style="--er-row-depth: ${depth}"`)
      : '';

  // Row composition (v0.20 redesign — ACCEPTED archive entry
  // `docs/studio-design/ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/`):
  //   <er-row-shell data-row-shell>
  //     <er-row-drawer/>        ← absolute-positioned, hidden at-rest;
  //                               revealed by swipe-left translating row-fg.
  //     <er-row-fg>             ← visible foreground.
  //       <er-row-num/>
  //       <er-calendar-body/>   ← slug + title + date
  //       <er-row-affordances/> ← inline chips (desktop) + ⋮ button
  //     </er-row-fg>
  //     <er-row-menu/>          ← absolute-positioned popover anchored to ⋮.
  //   </er-row-shell>
  // Client controller `row-actions.ts` wires the swipe gesture + menu state.
  return unsafe(html`
    <div class="er-row-shell" data-row-shell data-search="${search}"${depthAttrs}
      data-stage="${entry.currentStage}"
      data-uuid="${entry.uuid}" data-slug="${entry.slug}">
      ${renderRowDrawer(entry, defaultSite)}
      <div class="er-row-fg er-calendar-row" data-stage="${entry.currentStage}"
        data-uuid="${entry.uuid}" data-slug="${entry.slug}" data-search="${search}">
        <span class="er-row-num">№ ${String(index + 1).padStart(2, '0')}</span>
        <div class="er-calendar-body">
          <span class="er-row-slug"><a href="${reviewLink}"
            title="open the review surface">${entry.slug}</a></span>
          <span class="er-calendar-title">${entry.title}</span>
          <time class="er-calendar-meta er-calendar-meta-updated" data-format="date"
            datetime="${entry.updatedAt}" title="${entry.updatedAt}">${formatDate(entry.updatedAt)}</time>
        </div>
        <span class="er-calendar-status" aria-hidden="true"></span>
        ${renderRowActions(entry, defaultSite)}
      </div>
      ${renderRowMenu(entry, defaultSite)}
    </div>`);
}

/**
 * Render the stage tile (mobile-only collapsible head). Hidden on desktop
 * via dashboard-mobile.css; the existing `<h2 class="er-section-head">`
 * carries the head on desktop and is hidden at <=600px so the tile takes
 * over.
 *
 * Empty stages render the same tile shape but with `is-empty` styling and
 * `disabled` so taps are no-ops (operator can still SEE the empty stage
 * in the pipeline shape — they just can't drill in to nothing).
 *
 * Review-state sub-counts (e.g. "5 · 3 in review") were removed in v0.19
 * per operator: review state isn't user-facing data and is slated for
 * backend removal; the tile shows total entry count only.
 */
function renderStageTile(stage: Stage, count: number): RawHtml {
  const isEmpty = count === 0;
  const classes = isEmpty ? 'er-stage-tile is-empty' : 'er-stage-tile';
  const disabledAttr = isEmpty ? ' disabled' : '';
  return unsafe(html`
    <button class="${classes}" type="button"
      data-stage-tile="${stage}"
      aria-expanded="false"
      aria-controls="stage-${stage.toLowerCase()}"${unsafe(disabledAttr)}>
      <span class="er-stage-tile-glyph" aria-hidden="true">${STAGE_ORNAMENTS[stage]}</span>
      <span class="er-stage-tile-name">${stage}</span>
      <span class="er-stage-tile-count"><span class="num">${count}</span></span>
      <span class="er-stage-tile-chev" aria-hidden="true">›</span>
    </button>`);
}

/**
 * Render one full stage section: heading + ornaments + count + rows.
 *
 * The output is wrapped in a `.er-stage-block` div that pairs a mobile-
 * only stage tile (the collapsible head) with the existing section. On
 * desktop, the tile is `display: none` and the section's `<h2>` head
 * carries the heading as before. On mobile, the section's head is hidden
 * and the tile is shown; tapping the tile toggles a `data-collapsed`
 * attribute on the section that hides/shows its rows. Single-expand
 * (tapping one tile collapses the others) is handled by
 * `dashboard/stage-tiles.ts`.
 *
 * Empty stages still render their tile (so the pipeline shape is visible
 * at-rest on phone) but the empty section body itself is hidden on mobile.
 *
 * Empty stages on desktop render compact (just the heading, no placeholder
 * body) — keeps the operator's sense of pipeline shape without padding
 * the dashboard with multi-line empty placeholders for low-volume
 * calendars (#112). The hover title still surfaces the stage's
 * "what to run next" hint when the operator points at the heading.
 */
export function renderStageSection(
  stage: Stage,
  entries: readonly Entry[],
  defaultSite: string,
): RawHtml {
  const tile = renderStageTile(stage, entries.length);

  if (entries.length === 0) {
    return unsafe(html`
      <div class="er-stage-block" data-stage-block="${stage}">
        ${tile}
        <section class="er-section er-section--empty"
          id="stage-${stage.toLowerCase()}" data-stage-section="${stage}"
          data-empty-stage="${stage}">
          <h2 class="er-section-head er-section-head--empty"
            title="${STAGE_EMPTY_MESSAGES[stage]}">
            <span>${stage}</span>
            <span class="ornament">${STAGE_ORNAMENTS[stage]}</span>
            <span class="count">№ 00</span>
          </h2>
        </section>
      </div>`);
  }

  const body = unsafe(entries.map((e, i) => renderRow(e, i, defaultSite).__raw).join(''));

  return unsafe(html`
    <div class="er-stage-block" data-stage-block="${stage}">
      ${tile}
      <section class="er-section" id="stage-${stage.toLowerCase()}" data-stage-section="${stage}">
        <h2 class="er-section-head">
          <span>${stage}</span>
          <span class="ornament">${STAGE_ORNAMENTS[stage]}</span>
          <span class="count">№ ${entries.length}</span>
        </h2>
        ${body}
      </section>
    </div>`);
}

/**
 * Render the reserved Distribution placeholder. Distribution isn't a
 * pipeline stage in the formal sense (no entries flow through it; it
 * lives under its own model when shortform cross-posts arrive), but on
 * the mobile dashboard it renders as a stage tile alongside the rest
 * so the operator's pipeline-shape scan stays uniform — see operator
 * feedback on 2026-05-09. The tile is `is-empty` + `disabled` until
 * DistributionRecords land in the data layer.
 *
 * On desktop, the existing section + heading + placeholder text render
 * as before; the tile is `display: none` per dashboard-mobile.css.
 */
export function renderDistributionPlaceholder(): RawHtml {
  return unsafe(html`
    <div class="er-stage-block" data-stage-block="Distribution">
      <button class="er-stage-tile is-empty" type="button"
        data-stage-tile="Distribution"
        aria-expanded="false"
        aria-controls="stage-distribution" disabled>
        <span class="er-stage-tile-glyph" aria-hidden="true">⌘</span>
        <span class="er-stage-tile-name">Distribution</span>
        <span class="er-stage-tile-count"><span class="num">0</span></span>
        <span class="er-stage-tile-chev" aria-hidden="true">›</span>
      </button>
      <section class="er-section" id="stage-distribution" data-stage-section="Distribution">
        <h2 class="er-section-head">
          <span>Distribution</span>
          <span class="ornament">⌘</span>
        </h2>
        <div class="er-empty" style="padding: 1rem 0.25rem; font-size: 0.95rem;">
          Reserved for shortform DistributionRecords — separate model.
        </div>
      </section>
    </div>`);
}

function formatDate(iso: string): string {
  // Trim to YYYY-MM-DD for compact display. Full timestamp is on the
  // <span title="...">.
  return iso.slice(0, 10);
}
