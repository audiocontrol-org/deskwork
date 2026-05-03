/**
 * Entry-keyed press-check surface — `/dev/editorial-review/entry/:entryId`.
 *
 * Phase 34a Layer 2 relocated the implementation into the
 * `entry-review/` directory (one module per chrome component) so the
 * 500-line cap is respected. This file re-exports the public render
 * function so the existing `server.ts` import keeps working.
 *
 * Layer 1 (data foundation) shipped in commit a7e5804: entry-keyed
 * annotation store, history-journal reader, and four new entry-keyed
 * API endpoints (`/entry/:entryId/{annotate,annotations,decision,version}`).
 *
 * Layer 2 (this layer) ports the press-check chrome (folio + version
 * strip + edit toolbar + edit panes + outline drawer + marginalia
 * column + scrapbook drawer + decision strip + rendered preview)
 * from the legacy workflow-keyed surface (`pages/review.ts`) into
 * this entry-keyed surface, wired against the Layer 1 data layer.
 *
 * Layer 3 will retire the legacy review surface, swap every link
 * emitter to entry-keyed URLs, and restructure the bare-UUID route to
 * 301-redirect longform UUIDs into the entry-keyed path while
 * preserving shortform on a slim subset of the legacy renderer.
 */

export {
  renderEntryReviewPage,
  type EntryReviewQuery,
  type EntryReviewResult,
  type EntryReviewIndexGetter,
} from './entry-review/index.ts';
