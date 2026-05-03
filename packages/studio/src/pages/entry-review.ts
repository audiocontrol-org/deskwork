/**
 * Entry-keyed press-check surface — `/dev/editorial-review/entry/:entryId`.
 *
 * The implementation lives in the `entry-review/` directory (one
 * module per chrome component, each under the 500-line cap). This
 * file re-exports the public render function so the existing
 * `server.ts` import keeps working.
 */

export {
  renderEntryReviewPage,
  type EntryReviewQuery,
  type EntryReviewResult,
  type EntryReviewIndexGetter,
} from './entry-review/index.ts';
