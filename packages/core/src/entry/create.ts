import { writeSidecar } from '../sidecar/write.ts';
import type { ArtifactKind } from '../lanes/types.ts';
import type { Entry } from '../schema/entry.ts';

/**
 * Inputs for a freshly-minted entry sidecar.
 *
 * Both `deskwork add` and `deskwork ingest --apply` produce new entries
 * that need a sidecar written under the Phase 30 contract. They differ
 * in the optional fields (ingest knows an `artifactPath`; published
 * candidates carry a `datePublishedDate`), but the required-field
 * shape and the defaults (`keywords=[]`, `iterationByStage={}`,
 * `createdAt=updatedAt=now`) are identical. This helper is the single
 * point that knows the new-entry shape so both call sites stay aligned.
 *
 * AUDIT-20260528-39 / Phase 3 widening: `currentStage` is typed as
 * `string` (not the legacy editorial-narrow `Stage` union) to mirror
 * `EntrySchema`'s `currentStage: StageStringSchema` contract — lane
 * templates can declare arbitrary stage vocabularies (e.g. `Sketched`,
 * `Iterating`) and the create path must accept them. Stage validity
 * against the lane's pipeline template is the CALLER's responsibility
 * (CLI-side validation; see `packages/cli/src/commands/add.ts`), not
 * core's — core trusts the caller because core is invoked from multiple
 * boundaries (CLI add, CLI ingest, doctor migrations) that already own
 * their own validation surfaces.
 */
export interface CreateEntryParams {
  readonly uuid: string;
  readonly slug: string;
  readonly title: string;
  readonly description?: string;
  /**
   * Pipeline-template-derived stage name. Schema-level validation only
   * enforces non-empty string; the caller is responsible for asserting
   * that the stage belongs to the entry's lane template (typically via
   * `assertStageInTemplate` from `@deskwork/core/pipelines`).
   */
  readonly currentStage: string;
  readonly source: string;
  readonly artifactPath?: string;
  /**
   * YYYY-MM-DD; the helper converts to a full ISO datetime so the
   * `Entry.datePublished` schema (`z.string().datetime()`) accepts it.
   * Only honored when `currentStage === 'Published'`.
   */
  readonly datePublishedDate?: string;
  readonly keywords?: readonly string[];
  /**
   * Lane membership (Phase 3 Task 3.2 sidecar field). When omitted,
   * defaults to `'default'` so legacy editorial-only call sites
   * (pre-graphical-entries `deskwork add`) continue to write a
   * lane-bound sidecar without code changes.
   */
  readonly lane?: string;
  /**
   * Artifact-kind classification (Phase 3 Task 3.2 sidecar field).
   * When omitted, defaults to `'markdown'` so legacy editorial-only
   * call sites that scaffold a single .md file continue to write a
   * kind-bound sidecar without code changes.
   */
  readonly artifactKind?: ArtifactKind;
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
  const lane = params.lane ?? 'default';
  const artifactKind = params.artifactKind ?? 'markdown';
  const entry: Entry = {
    uuid: params.uuid,
    slug: params.slug,
    title: params.title,
    ...(params.description ? { description: params.description } : {}),
    keywords: params.keywords ? [...params.keywords] : [],
    source: params.source,
    currentStage: params.currentStage,
    iterationByStage: {},
    lane,
    artifactKind,
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
