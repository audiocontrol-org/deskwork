import { writeSidecar } from '../sidecar/write.ts';
import type { Entry, ReviewState, Stage } from '../schema/entry.ts';

/**
 * Inputs for a freshly-minted entry sidecar.
 *
 * Both `deskwork add` and `deskwork ingest --apply` produce new entries
 * that need a sidecar written under the Phase 30 contract. They differ
 * in the optional fields (ingest knows an `artifactPath`; published
 * candidates carry a `datePublishedDate`; legacy `Review` mapping
 * produces a `reviewState`), but the required-field shape and the
 * defaults (`keywords=[]`, `iterationByStage={}`, `createdAt=updatedAt=now`)
 * are identical. This helper is the single point that knows the new-entry
 * shape so both call sites stay aligned.
 */
export interface CreateEntryParams {
  readonly uuid: string;
  readonly slug: string;
  readonly title: string;
  readonly description?: string;
  readonly currentStage: Stage;
  readonly source: string;
  readonly reviewState?: ReviewState;
  readonly artifactPath?: string;
  /**
   * YYYY-MM-DD; the helper converts to a full ISO datetime so the
   * `Entry.datePublished` schema (`z.string().datetime()`) accepts it.
   * Only honored when `currentStage === 'Published'`.
   */
  readonly datePublishedDate?: string;
  readonly keywords?: readonly string[];
  /**
   * Test seam — defaults to `new Date()` when omitted. Lets unit tests
   * pin `createdAt`/`updatedAt`/`datePublished`-derived ISO without
   * stubbing globals.
   */
  readonly now?: Date;
}

/**
 * Build a fresh `Entry` from the supplied params, write it to
 * `.deskwork/entries/<uuid>.json`, and return the constructed Entry
 * (callers don't need the return value but it's cheap to provide and
 * useful in tests).
 *
 * Defaults:
 *   - `keywords` → `[]`
 *   - `iterationByStage` → `{}`
 *   - `createdAt` / `updatedAt` → `now.toISOString()`
 *   - `datePublished` (only if `currentStage === 'Published'` and
 *     `datePublishedDate` is supplied) → `${datePublishedDate}T00:00:00.000Z`
 *
 * Phase 30 contract: every UUID in `calendar.md` must have a sidecar.
 * Both `deskwork add` and `deskwork ingest --apply` MUST pair their
 * calendar.md write with a `createFreshEntrySidecar` call to satisfy
 * doctor's `calendar-sidecar` validator.
 */
export async function createFreshEntrySidecar(
  projectRoot: string,
  params: CreateEntryParams,
): Promise<Entry> {
  const at = (params.now ?? new Date()).toISOString();
  const entry: Entry = {
    uuid: params.uuid,
    slug: params.slug,
    title: params.title,
    ...(params.description ? { description: params.description } : {}),
    keywords: params.keywords ? [...params.keywords] : [],
    source: params.source,
    currentStage: params.currentStage,
    iterationByStage: {},
    ...(params.reviewState !== undefined ? { reviewState: params.reviewState } : {}),
    ...(params.artifactPath !== undefined ? { artifactPath: params.artifactPath } : {}),
    ...(params.currentStage === 'Published' && params.datePublishedDate
      ? { datePublished: `${params.datePublishedDate}T00:00:00.000Z` }
      : {}),
    createdAt: at,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, entry);
  return entry;
}
