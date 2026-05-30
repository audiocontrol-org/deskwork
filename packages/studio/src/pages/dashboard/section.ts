/**
 * Row + Distribution-placeholder renderers for the dashboard.
 *
 * Per DESKWORK-STATE-MACHINE.md Commandment III, rows do NOT surface
 * iteration counts or reviewState — those were retired in v0.19 along
 * with the legacy reviewState concept.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { Entry } from '@deskwork/core/schema/entry';
import type { StrictPipelineTemplate } from '@deskwork/core/pipelines';
import { renderRowActions, renderRowDrawer, renderRowMenu } from './affordances.ts';

/**
 * Render the "Member of: N groups" pull-tab on the row's LEFT edge
 * (Phase 7 Task 7.3 — Direction 1: pull-tab on row edge). Returns ''
 * when the entry isn't a member of any populated group.
 *
 * Per `.claude/rules/affordance-placement.md`: the tab lives ON the
 * row it affects, mirroring the `.er-marginalia-tab` /
 * `.er-outline-tab` precedent. Vertical orientation (writing-mode
 * vertical-rl) + edge-anchored placement + kraft accent.
 *
 * Tap → row enters `.is-expanded`; the inline popover below the row
 * surfaces every parent group as a clipboard-copy link.
 */
function renderMemberTab(parents: readonly Entry[]): RawHtml {
  if (parents.length === 0) return unsafe('');
  return unsafe(html`
    <button class="er-row-member-tab" type="button"
      data-row-member-tab
      data-parent-count="${parents.length}"
      aria-expanded="false"
      aria-label="Member of ${parents.length} ${parents.length === 1 ? 'group' : 'groups'}; tap to list parents">
      <span class="er-row-member-tab-label" aria-hidden="true">Member</span>
      <span class="er-row-member-tab-count" aria-hidden="true">${parents.length}</span>
    </button>`);
}

function renderMemberPopover(parents: readonly Entry[]): RawHtml {
  if (parents.length === 0) return unsafe('');
  const linksRaw = parents
    .map((parent) => {
      const href = `/dev/editorial-review/entry/${parent.uuid}`;
      const backLink = `Member of [${parent.title}](${href})`;
      return html`
        <a class="er-row-member-link"
          href="${href}"
          target="_blank"
          rel="noopener"
          data-parent-uuid="${parent.uuid}"
          data-back-link="${backLink}">
          <span class="er-row-member-link-name">${parent.title}</span>
          <span class="er-row-member-link-slug">${parent.slug}</span>
          <span class="er-row-member-link-open" aria-hidden="true">↪</span>
        </a>`;
    })
    .join('');
  const headLabel = parents.length === 1
    ? 'Member of 1 group'
    : `Member of ${parents.length} groups`;
  return unsafe(html`
    <div class="er-row-member-popover" data-row-member-popover hidden>
      <div class="er-row-member-popover-head">${headLabel}</div>
      ${unsafe(linksRaw)}
    </div>`);
}

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
export function renderRow(
  entry: Entry,
  index: number,
  template: StrictPipelineTemplate,
  defaultSite: string,
  parentsByMemberUuid: ReadonlyMap<string, readonly Entry[]> = new Map(),
): RawHtml {
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
  // data-* attrs (search/stage/uuid/slug) live on the SHELL only —
  // the shell is the affordance boundary now. Existing filter +
  // probe code targets `.er-calendar-row` so the legacy class stays
  // on `.er-row-fg`, but the canonical attribute carriers are on the
  // shell. Test selectors should prefer `[data-row-shell]`.
  // Phase 7 Task 7.3 Direction 1 — Member-of pull-tab on the row's
  // LEFT edge when the entry is a member of one or more populated
  // groups. The tab + popover are siblings of `.er-row-fg`; CSS
  // anchors the tab at the row's left edge and reveals the popover
  // when the row carries `.is-member-expanded`.
  const parents = parentsByMemberUuid.get(entry.uuid) ?? [];
  const memberClass = parents.length > 0 ? ' has-member-tab' : '';
  return unsafe(html`
    <div class="er-row-shell${unsafe(memberClass)}" data-row-shell data-search="${search}"${depthAttrs}
      data-stage="${entry.currentStage}"
      data-uuid="${entry.uuid}" data-slug="${entry.slug}">
      ${renderMemberTab(parents)}
      ${renderRowDrawer(entry, template, defaultSite)}
      <div class="er-row-fg er-calendar-row">
        <span class="er-row-num">№ ${String(index + 1).padStart(2, '0')}</span>
        <div class="er-calendar-body">
          <span class="er-row-slug"><a href="${reviewLink}"
            title="open the review surface">${entry.slug}</a></span>
          <span class="er-calendar-title">${entry.title}</span>
          <time class="er-calendar-meta er-calendar-meta-updated" data-format="date"
            datetime="${entry.updatedAt}" title="${entry.updatedAt}">${formatDate(entry.updatedAt)}</time>
        </div>
        <span class="er-calendar-status" aria-hidden="true"></span>
        ${renderRowActions(entry, template, defaultSite)}
      </div>
      ${renderRowMenu(entry, template, defaultSite)}
      ${renderMemberPopover(parents)}
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
        data-stage-section-group="longform"
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
