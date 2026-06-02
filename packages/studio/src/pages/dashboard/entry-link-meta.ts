/**
 * Shared helper for entry-row link metadata across dashboard renderers.
 *
 * Both `swimlane-entry-card.ts` (kanban `.card`) and `swimlane-list-
 * body.ts` (list `.lb-row`) emit an `<a>` that links to the entry's
 * review surface and carries the same `data-row-shell` / `data-
 * search` / `data-stage` / `data-uuid` / `data-slug` attribute set
 * tests + downstream affordance work expect. Factoring the
 * computation here keeps the two renderers in lockstep and removes
 * the structural duplication a clone-detector pass would otherwise
 * flag.
 */

import type { Entry } from '@deskwork/core/schema/entry';

export interface EntryRowLinkMeta {
  /** Absolute href to the entry-review surface for this entry. */
  readonly reviewLink: string;
  /**
   * Lowercased search index — `slug + title + keywords` joined by
   * spaces. Used by the dashboard's client-side filter.
   */
  readonly search: string;
}

export function entryRowLinkMeta(entry: Entry): EntryRowLinkMeta {
  return {
    reviewLink: `/dev/editorial-review/entry/${entry.uuid}`,
    search: [entry.slug, entry.title, entry.keywords.join(' ')]
      .join(' ')
      .toLowerCase(),
  };
}
