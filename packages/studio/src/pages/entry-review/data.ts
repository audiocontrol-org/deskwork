/**
 * Data loader for the entry-keyed press-check surface (Phase 34a Layer 2).
 *
 * Resolves an entry UUID to:
 *   - the sidecar (`Entry`) + on-disk artifact body (via `resolveEntry`).
 *   - the iteration journal listing for the version strip (via Layer 1's
 *     `listEntryIterations`).
 *   - the entry-keyed annotation list for the marginalia column (via
 *     Layer 1's `listEntryAnnotations`).
 *   - which site the entry belongs to, by scanning configured calendars
 *     for a matching UUID. The scrapbook drawer + content index need the
 *     site to resolve filesystem paths and build URLs.
 *   - the matching `CalendarEntry` (when present) so the scrapbook drawer
 *     can use the index-driven binding rather than slug-template paths.
 *
 * The version-strip can optionally render historical content (when the
 * `?v=<n>` query param is set). When that param is present and resolves
 * to an iteration we have content for, the renderer swaps the on-disk
 * artifact body for the historical markdown captured in the journal.
 */

import { existsSync } from 'node:fs';
import { resolveEntry } from '../../lib/entry-resolver.ts';
import type { StudioContext } from '../../routes/api.ts';
import { readCalendar } from '@deskwork/core/calendar';
import { findEntryById } from '@deskwork/core/calendar-mutations';
import { resolveCalendarPath } from '@deskwork/core/paths';
import {
  listEntryIterations,
  getEntryIteration,
  type IterationListing,
  type IterationContent,
} from '@deskwork/core/iterate/history';
import { listEntryAnnotations } from '@deskwork/core/entry/annotations';
import type { Entry } from '@deskwork/core/schema/entry';
import type { CalendarEntry } from '@deskwork/core/types';
import type { DraftAnnotation } from '@deskwork/core/review/types';

export interface EntryReviewData {
  readonly entry: Entry;
  readonly artifactPath: string;
  /** Markdown to render in the article column. When `historical` is set,
   *  this is the historical version's markdown, not the on-disk body. */
  readonly markdown: string;
  /** True when the renderer is showing a prior version (read-only). */
  readonly historical: IterationContent | null;
  readonly iterations: readonly IterationListing[];
  readonly annotations: readonly DraftAnnotation[];
  /** Site slug the entry belongs to (for URL building + content-index
   *  lookup). Falls back to `config.defaultSite` when the entry isn't
   *  found in any configured calendar. */
  readonly site: string;
  /** The matching CalendarEntry, when present. Drives index-bound
   *  scrapbook resolution; null falls back to slug-template paths. */
  readonly calendarEntry: CalendarEntry | null;
}

export interface LoadOptions {
  /** Optional `?v=<n>` from the request URL. */
  readonly version?: string | null;
}

/**
 * Locate which configured site's calendar the entry belongs to. Returns
 * the first match (entry UUIDs are globally unique). Falls back to
 * `config.defaultSite` with a null `calendarEntry` when no calendar
 * carries the entry.
 *
 * Failures (calendar absent, parse error) fall through to the default
 * — the press-check surface should render even when calendar resolution
 * is wonky for an unrelated reason.
 */
function findEntrySite(
  ctx: StudioContext,
  entryId: string,
): { site: string; calendarEntry: CalendarEntry | null } {
  for (const site of Object.keys(ctx.config.sites)) {
    try {
      const calendarPath = resolveCalendarPath(ctx.projectRoot, ctx.config, site);
      if (!existsSync(calendarPath)) continue;
      const cal = readCalendar(calendarPath);
      const entry = findEntryById(cal, entryId);
      if (entry !== undefined) {
        return { site, calendarEntry: entry };
      }
    } catch {
      // Calendar unreadable for this site — try the next one.
      continue;
    }
  }
  return { site: ctx.config.defaultSite, calendarEntry: null };
}

function parseVersionParam(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function loadEntryReviewData(
  ctx: StudioContext,
  entryId: string,
  opts: LoadOptions = {},
): Promise<EntryReviewData> {
  const resolved = await resolveEntry(ctx.projectRoot, entryId);
  const iterations = await listEntryIterations(ctx.projectRoot, entryId);
  const annotations = await listEntryAnnotations(ctx.projectRoot, entryId);
  const { site, calendarEntry } = findEntrySite(ctx, entryId);

  // Historical-version handling. Only swap the markdown when both the
  // version param resolves and the journal has content for it.
  let historical: IterationContent | null = null;
  let markdown = resolved.artifactBody;
  const requested = parseVersionParam(opts.version ?? null);
  if (requested !== null) {
    const found = await getEntryIteration(ctx.projectRoot, entryId, requested);
    if (found !== null) {
      historical = found;
      markdown = found.markdown;
    }
  }

  return {
    entry: resolved.entry,
    artifactPath: resolved.artifactPath,
    markdown,
    historical,
    iterations,
    annotations,
    site,
    calendarEntry,
  };
}
