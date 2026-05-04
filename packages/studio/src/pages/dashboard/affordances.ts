/**
 * Per-row affordance helpers for the dashboard.
 *
 * Pipeline-redesign Task 34. Buttons are static HTML — they link to
 * the entry's review surface (`/dev/editorial-review/<uuid>`) or
 * carry a `data-copy` payload that the existing studio client copies
 * to the clipboard. No new backend handlers are wired here; the
 * universal-verb skills are the canonical action path.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { Entry, Stage, ReviewState } from '@deskwork/core/schema/entry';

const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  'in-review': 'in review',
  iterating: 'iterating',
  approved: 'approved',
};

/**
 * Render the reviewState badge. When the entry has no reviewState
 * (most pre-review stages), render an em-dash placeholder so the row
 * stays grid-aligned with sibling rows that DO carry a badge.
 */
export function renderReviewStateBadge(state: ReviewState | undefined): RawHtml {
  if (state === undefined) {
    return unsafe('<span class="er-stamp er-stamp-none" data-review-state="none">—</span>');
  }
  return unsafe(html`<span class="er-stamp er-stamp-${state}" data-review-state="${state}">${REVIEW_STATE_LABEL[state]}</span>`);
}

/**
 * Iteration count for the entry's current stage. The sidecar's
 * `iterationByStage` records every stage the entry has touched; this
 * surfaces the count for the stage the entry is currently in. Defaults
 * to 0 when the bucket is missing (a brand-new entry on its first tick
 * before any iterate has fired).
 */
export function iterationForCurrentStage(entry: Entry): number {
  return entry.iterationByStage[entry.currentStage] ?? 0;
}

/**
 * Build the per-row action strip. Affordances vary by stage:
 *
 * - Linear pipeline stages (Ideas / Planned / Outlining / Drafting /
 *   Final): "open →" link to the review surface, plus an "iterate"
 *   copy-CLI button when reviewState is `iterating` and an
 *   "approve" copy-CLI button when reviewState is `approved`.
 * - Published: "view →" (read-only review surface).
 * - Blocked / Cancelled: "induct →" copy-CLI to bring the entry back.
 *
 * All non-terminal stages also get a `scrapbook ↗` link (#157) — the
 * scrapbook viewer is the primary surface for entry-attached research
 * notes / images / config / drafts and was previously unreachable
 * from the dashboard.
 *
 * Each button's behavior is parked behind a `data-copy` attribute so
 * the existing studio client (editorial-studio-client.ts) handles
 * clipboard wiring without new server handlers.
 */
export function renderRowActions(entry: Entry, defaultSite: string): RawHtml {
  const buttons: string[] = [];
  const stage = entry.currentStage;
  const reviewLink = `/dev/editorial-review/entry/${entry.uuid}`;
  // Scrapbook URL uses the project's defaultSite. Multi-site calendars
  // would require a per-entry site lookup (out of scope for #157 — the
  // primary value is the dashboard ↔ scrapbook entry point existing at
  // all, and most projects have a single site). Slug already contains
  // any hierarchical path segments.
  const scrapLink = `/dev/scrapbook/${defaultSite}/${entry.slug}`;

  if (isLinearActiveStage(stage)) {
    buttons.push(html`<a class="er-btn er-btn-small" href="${reviewLink}"
      title="open the review surface for ${entry.slug}">open →</a>`);
    if (entry.reviewState === 'iterating') {
      buttons.push(html`<button class="er-btn er-btn-small er-btn-primary er-copy-btn" type="button"
        data-copy="/deskwork:iterate ${entry.slug}"
        title="operator clicked Iterate — run the iterate skill in Claude Code">iterate →</button>`);
    }
    if (entry.reviewState === 'approved') {
      buttons.push(html`<button class="er-btn er-btn-small er-btn-approve er-copy-btn" type="button"
        data-copy="/deskwork:approve ${entry.slug}"
        title="approved — graduate to the next stage">approve →</button>`);
    }
  } else if (stage === 'Published') {
    buttons.push(html`<a class="er-btn er-btn-small" href="${reviewLink}"
      title="read-only review surface for the published entry">view →</a>`);
  } else if (stage === 'Blocked' || stage === 'Cancelled') {
    buttons.push(html`<button class="er-btn er-btn-small er-copy-btn" type="button"
      data-copy="/deskwork:induct ${entry.slug}"
      title="bring this entry back into the pipeline">induct →</button>`);
  }

  // Scrapbook link follows every stage's primary action.
  buttons.push(html`<a class="er-btn er-btn-small er-btn-scrap"
    href="${scrapLink}" data-action="open-scrapbook"
    title="open the entry's scrapbook (research notes, drafts, etc.)">scrapbook ↗</a>`);

  return unsafe(`<span class="er-calendar-action">${buttons.join('')}</span>`);
}

function isLinearActiveStage(stage: Stage): boolean {
  return (
    stage === 'Ideas' ||
    stage === 'Planned' ||
    stage === 'Outlining' ||
    stage === 'Drafting' ||
    stage === 'Final'
  );
}
