/**
 * Scrapbook page listing dispatch — entry-aware vs slug-template
 * resolution. Mirrors the post-#191 envelope/dispatch split for
 * mutations: dispatch chooses the addressing mode, render stays free
 * of the resolution branch.
 */

import { existsSync } from 'node:fs';
import { readCalendar } from '@deskwork/core/calendar';
import { findEntry } from '@deskwork/core/calendar-mutations';
import { resolveCalendarPath } from '@deskwork/core/paths';
import {
  listScrapbook,
  listScrapbookForEntry,
  scrapbookDirAtPath,
  scrapbookDirForEntry,
  type ScrapbookSummary,
} from '@deskwork/core/scrapbook';
import { readSidecar } from '@deskwork/core/sidecar';
import { UUID_RE } from '../../routes/scrapbook-mutation-envelope.ts';
import type { StudioContext } from '../../routes/api.ts';

/**
 * Error class surfaced by the page route to translate into HTTP status
 * codes (`server.ts` maps these onto 400/404 responses).
 */
export class ScrapbookPageError extends Error {
  readonly status: 400 | 404;
  constructor(message: string, status: 400 | 404) {
    super(message);
    this.status = status;
    this.name = 'ScrapbookPageError';
  }
}

/**
 * #168 Phase 34 ship-pass — when the scrapbook path matches a tracked
 * calendar entry with a stamped UUID, return the entry's id so the aside
 * can render a "← back to review" link AND the client can address
 * mutations via `entryId` (#191 fix). Returns null when no entry matches
 * (organizational subdirs, ad-hoc paths, or pre-doctor entries lacking
 * an id) — the link is then omitted and mutations fall back to slug-
 * template addressing.
 *
 * Failures (calendar absent, parse error) fall through to null so a
 * transient calendar issue never blocks the scrapbook render.
 */
export function lookupEntryId(
  ctx: StudioContext,
  site: string,
  path: string,
): string | null {
  if (!(site in ctx.config.sites)) return null;
  try {
    const calendarPath = resolveCalendarPath(ctx.projectRoot, ctx.config, site);
    if (!existsSync(calendarPath)) return null;
    const cal = readCalendar(calendarPath);
    const entry = findEntry(cal, path);
    if (!entry || !entry.id) return null;
    return entry.id;
  } catch {
    return null;
  }
}

/**
 * #205 — listing + dir-resolution dispatch. Two addressing modes:
 *
 *   - Entry-id mode: `entryId` is validated as a UUID, the sidecar is
 *     read, and the listing resolves via `listScrapbookForEntry` so
 *     non-kebab-case entries (feature-doc layouts, dotted version
 *     segments, etc.) read items from the entry's artifact-parent
 *     `scrapbook/` directory. Symmetric to the entry-aware mutation API.
 *   - Slug mode: legacy / organizational paths under the site's content
 *     dir. Resolves via `scrapbookDirAtPath` + `listScrapbook` (the
 *     pre-#205 behavior).
 *
 * Returns the resolved `scrapbookDir` (absolute) plus the listing
 * summary so the caller threads both through to render helpers.
 */
export async function resolveListing(
  ctx: StudioContext,
  site: string,
  path: string,
  entryId: string | null,
): Promise<{ scrapbookDir: string; result: ScrapbookSummary; resolvedEntryId: string | null }> {
  if (entryId !== null) {
    if (!UUID_RE.test(entryId)) {
      throw new ScrapbookPageError(`invalid entryId`, 400);
    }
    let entry;
    try {
      entry = await readSidecar(ctx.projectRoot, entryId);
    } catch (e) {
      // readSidecar throws "sidecar not found" with ENOENT; map to 404.
      const reason = e instanceof Error ? e.message : String(e);
      if (/sidecar not found/i.test(reason)) {
        throw new ScrapbookPageError(reason, 404);
      }
      throw e;
    }
    const scrapbookDir = scrapbookDirForEntry(
      ctx.projectRoot,
      ctx.config,
      site,
      { id: entry.uuid, slug: entry.slug },
    );
    const result = listScrapbookForEntry(
      ctx.projectRoot,
      ctx.config,
      site,
      { id: entry.uuid, slug: entry.slug },
    );
    return { scrapbookDir, result, resolvedEntryId: entry.uuid };
  }
  // Slug-mode: legacy back-compat. listScrapbook returns
  // { exists: false, items: [] } for missing dirs, so an empty
  // scrapbook is not an error path. Real errors (slug validation,
  // scrapbookDir resolution failures, FS permission issues)
  // propagate to the studio's error handler.
  const scrapbookDir = scrapbookDirAtPath(ctx.projectRoot, ctx.config, site, path);
  const result = listScrapbook(ctx.projectRoot, ctx.config, site, path);
  // Best-effort lookup so the back-link to the review surface still
  // renders for slug-template entries that happen to match a calendar
  // entry by slug.
  const resolvedEntryId = lookupEntryId(ctx, site, path);
  return { scrapbookDir, result, resolvedEntryId };
}
