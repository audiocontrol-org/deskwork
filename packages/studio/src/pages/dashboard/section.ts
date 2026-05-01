/**
 * Single-stage section renderer.
 *
 * Pipeline-redesign Task 34. Each of the eight stage sections renders
 * with a section heading (stage name + entry count) and either a list
 * of rows or an empty-state placeholder. Per-row HTML carries the
 * sidecar-derived state inline (iteration count + reviewState badge)
 * so an operator can see at a glance where each entry sits without
 * opening it.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { Entry, Stage } from '@deskwork/core/schema/entry';
import {
  iterationForCurrentStage,
  renderReviewStateBadge,
  renderRowActions,
} from './affordances.ts';

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
 *   - iteration count for the entry's currentStage
 *   - reviewState badge (or an em-dash placeholder)
 *   - updatedAt timestamp
 *   - per-stage action buttons
 */
export function renderRow(entry: Entry, index: number): RawHtml {
  const iteration = iterationForCurrentStage(entry);
  const reviewLink = `/dev/editorial-review/${entry.uuid}`;
  const search = [entry.slug, entry.title, entry.keywords.join(' ')].join(' ').toLowerCase();
  // Hierarchical entries (slugs containing `/`) get a visual indent
  // marker the CSS layer reads. Storage stays flat; this is display-only.
  const depth = entry.slug.split('/').length - 1;
  const depthAttrs =
    depth > 0
      ? unsafe(html` data-depth="${depth}" style="--er-row-depth: ${depth}"`)
      : '';

  return unsafe(html`
    <div class="er-calendar-row-wrap" data-row-wrap data-search="${search}"${depthAttrs}>
      <div class="er-calendar-row" data-stage="${entry.currentStage}"
        data-uuid="${entry.uuid}" data-slug="${entry.slug}" data-search="${search}">
        <span class="er-row-num">№ ${String(index + 1).padStart(2, '0')}</span>
        <div class="er-calendar-body">
          <span class="er-row-slug"><a href="${reviewLink}"
            title="open the review surface">${entry.slug}</a></span>
          <span class="er-calendar-title">${entry.title}</span>
          <span class="er-calendar-meta er-calendar-meta-iteration"
            data-iteration="${iteration}">iteration: ${iteration}</span>
          <span class="er-calendar-meta er-calendar-meta-updated"
            title="${entry.updatedAt}">${formatDate(entry.updatedAt)}</span>
        </div>
        <span class="er-calendar-status">${renderReviewStateBadge(entry.reviewState)}</span>
        ${renderRowActions(entry)}
      </div>
    </div>`);
}

/**
 * Render one full stage section: heading + ornaments + count + rows.
 * Empty stages render the placeholder message — keeping the section
 * visible (rather than collapsing it) so the operator sees that the
 * stage exists and is currently empty.
 */
export function renderStageSection(stage: Stage, entries: readonly Entry[]): RawHtml {
  const body =
    entries.length === 0
      ? unsafe(html`<div class="er-empty" data-empty-stage="${stage}"
          style="padding: 1rem 0.25rem; font-size: 0.95rem;">
          ${STAGE_EMPTY_MESSAGES[stage]}
        </div>`)
      : unsafe(entries.map((e, i) => renderRow(e, i).__raw).join(''));

  return unsafe(html`
    <section class="er-section" id="stage-${stage.toLowerCase()}" data-stage-section="${stage}">
      <h2 class="er-section-head">
        <span>${stage}</span>
        <span class="ornament">${STAGE_ORNAMENTS[stage]}</span>
        <span class="count">№ ${entries.length}</span>
      </h2>
      ${body}
    </section>`);
}

/**
 * Render the reserved Distribution placeholder. Stays a separate
 * sibling of the stage sections — distribution records (shortform
 * cross-posts) are tracked under their own model and the dashboard
 * surfaces only a placeholder here until that integration lands.
 */
export function renderDistributionPlaceholder(): RawHtml {
  return unsafe(html`
    <section class="er-section" id="stage-distribution" data-stage-section="Distribution">
      <h2 class="er-section-head">
        <span>Distribution</span>
        <span class="ornament">⌘</span>
      </h2>
      <div class="er-empty" style="padding: 1rem 0.25rem; font-size: 0.95rem;">
        Reserved for shortform DistributionRecords — separate model.
      </div>
    </section>`);
}

function formatDate(iso: string): string {
  // Trim to YYYY-MM-DD for compact display. Full timestamp is on the
  // <span title="...">.
  return iso.slice(0, 10);
}
