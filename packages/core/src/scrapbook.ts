/**
 * Scrapbook helpers — the per-article `<contentDir>/<slug>/scrapbook/`
 * directory. The scrapbook is a working-notes home for receipts,
 * research, and references attached to an in-flight article. Committed
 * to git alongside the article; not baked to the public site.
 *
 * Responsibilities (split across sibling modules under `scrapbook/`
 * per #202; this file is a barrel re-export so existing
 * `import from '@deskwork/core/scrapbook'` sites stay unchanged):
 *
 *   - `scrapbook/types.ts`       — public types
 *   - `scrapbook/validation.ts`  — slug + filename validation, classify
 *   - `scrapbook/paths.ts`       — public (entry-aware + path-aware) +
 *                                  private (slug-template) resolvers
 *   - `scrapbook/listing.ts`     — list + count
 *   - `scrapbook/read.ts`        — read primitives
 *   - `scrapbook/crud-at-dir.ts` — entry-aware CRUD primitives (post-#191)
 *   - `scrapbook/crud-slug.ts`   — INTERNAL slug-template CRUD primitives
 *   - `scrapbook/seed.ts`        — plan-time scaffolding
 *   - `scrapbook/format.ts`      — UI formatters
 *
 * Public API surface (#192 — slug-template mutators are NO LONGER
 * exported; callers go through `scrapbookDirForEntry` + the `*AtDir`
 * family instead):
 *
 *   - Types: `ScrapbookItemKind`, `ScrapbookItem`, `ScrapbookSummary`,
 *     `ScrapbookLocation`, `SECRET_SUBDIR`
 *   - Validation: `assertSlug`, `assertFilename`, `slugSegments`,
 *     `isNestedSlug`, `SLUG_SEGMENT_RE`, `classify`
 *   - Paths: `scrapbookDirAtPath`, `scrapbookDirForEntry`,
 *     `scrapbookFilePathAtDir`
 *   - Listing: `listScrapbook`, `listScrapbookAtDir`,
 *     `listScrapbookForEntry`, `countScrapbook`, `countScrapbookForEntry`
 *   - Read: `readScrapbookFile`, `readScrapbookFileAtDir`,
 *     `readScrapbookFileForEntry`
 *   - CRUD: `createScrapbookMarkdownAtDir`, `saveScrapbookFileAtDir`,
 *     `renameScrapbookFileAtDir`, `deleteScrapbookFileAtDir`,
 *     `writeScrapbookUploadAtDir`
 *   - Seed: `seedScrapbookReadme`
 *   - Format: `formatRelativeTime`, `formatSize`
 *
 * The API endpoints that wrap these helpers should 404 in PROD; this
 * library contains no PROD check of its own (enforcement stays at the
 * endpoint boundary).
 */

export type {
  ScrapbookItem,
  ScrapbookItemKind,
  ScrapbookLocation,
  ScrapbookSummary,
} from './scrapbook/types.ts';
export { SECRET_SUBDIR } from './scrapbook/types.ts';

export {
  assertFilename,
  assertSlug,
  classify,
  isNestedSlug,
  SLUG_SEGMENT_RE,
  slugSegments,
} from './scrapbook/validation.ts';

export {
  scrapbookDirAtPath,
  scrapbookDirForEntry,
  scrapbookFilePathAtDir,
} from './scrapbook/paths.ts';

export {
  countScrapbook,
  countScrapbookForEntry,
  listScrapbook,
  listScrapbookAtDir,
  listScrapbookForEntry,
} from './scrapbook/listing.ts';

export {
  readScrapbookFile,
  readScrapbookFileAtDir,
  readScrapbookFileForEntry,
} from './scrapbook/read.ts';

export {
  createScrapbookMarkdownAtDir,
  deleteScrapbookFileAtDir,
  renameScrapbookFileAtDir,
  saveScrapbookFileAtDir,
  writeScrapbookUploadAtDir,
} from './scrapbook/crud-at-dir.ts';

export { seedScrapbookReadme } from './scrapbook/seed.ts';

export { formatRelativeTime, formatSize } from './scrapbook/format.ts';
