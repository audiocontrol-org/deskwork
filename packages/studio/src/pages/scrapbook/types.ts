/**
 * Scrapbook page render context — shared between dispatch + render
 * helpers in the scrapbook page split.
 *
 * #205 — the entryId is the load-bearing addition. When present, it
 * threads into the file-fetch URL via `entryId=` so the read-only
 * binary endpoint resolves through `scrapbookDirForEntry` (matching
 * the entry-aware mutation API). When absent, slug-template addressing
 * (`path=`) is the back-compat fallback.
 */

import type { StudioContext } from '../../routes/api.ts';

/**
 * Per-render context for the scrapbook page. Carries a pre-resolved
 * absolute scrapbook directory (used for filesystem reads in
 * `computeKindMeta` / `renderPreview`) plus the addressing identifiers
 * used in URL emission (`site`, `path`, optional `entryId`).
 */
export interface RenderCtx {
  studio: StudioContext;
  site: string;
  path: string;
  entryId?: string;
  /** Absolute path of the scrapbook directory on disk. */
  scrapbookDir: string;
}
