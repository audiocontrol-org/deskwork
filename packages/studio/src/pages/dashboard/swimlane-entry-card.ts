/**
 * Stage-vocabulary dispatch + lighter entry-card markup for the
 * multi-lane swimlane dashboard's per-stage columns.
 *
 * The editorial verb-chip helpers (`renderRow`, `verbsForStage`)
 * predate the multi-template work and only handle the eight
 * editorial stages. An entry in a visual or qa-plan lane whose
 * `currentStage` is a non-editorial name (Sketched, Iterating,
 * Drafted, Reviewed, Tested, etc.) has no inline-chip semantics
 * under the current verb-chip helpers, so the column renders it
 * as a lighter `.card` form that preserves the data attributes
 * existing tests + future affordance work depend on.
 *
 * Task 5.2 generalises verbsForStage by template and retires this
 * dispatch; the card form is additive markup so Task 5.2 can add
 * verb chrome to it without rewriting the column renderer.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { Entry } from '@deskwork/core/schema/entry';

/**
 * The eight editorial stage names that `renderRow` /
 * `verbsForStage` know how to handle. Entries whose `currentStage`
 * is in this set render via the full row chrome; others render via
 * `renderEntryCard` below.
 */
const EDITORIAL_STAGE_VOCAB: ReadonlySet<string> = new Set([
  'Ideas',
  'Planned',
  'Outlining',
  'Drafting',
  'Final',
  'Published',
  'Blocked',
  'Cancelled',
]);

export function isEditorialStage(stage: string): boolean {
  return EDITORIAL_STAGE_VOCAB.has(stage);
}

/**
 * Render a lighter card for an entry whose stage vocabulary isn't
 * the editorial set. Preserves the data-* attributes existing
 * tests + future affordance work depend on. The card lives inside
 * its stage column; clicking it opens the entry's review surface
 * (the same target as the dashboard row's slug link).
 */
export function renderEntryCard(entry: Entry, defaultSite: string): RawHtml {
  void defaultSite;
  const reviewLink = `/dev/editorial-review/entry/${entry.uuid}`;
  const search = [entry.slug, entry.title, entry.keywords.join(' ')]
    .join(' ')
    .toLowerCase();
  return unsafe(html`
    <a class="card" href="${reviewLink}"
      data-row-shell data-search="${search}"
      data-stage="${entry.currentStage}"
      data-uuid="${entry.uuid}" data-slug="${entry.slug}"
      title="open the review surface">
      <span class="card-title">${entry.title}</span>
      <span class="e-meta">${entry.slug}</span>
    </a>`);
}
