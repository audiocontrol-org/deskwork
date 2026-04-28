/**
 * Workflow → on-disk markdown file resolution.
 *
 * Both `handleStartLongform` and `handleCreateVersion` need to translate a
 * (site, slug, contentKind, entryId?, platform?, channel?) tuple into an
 * absolute file path. Pulled out of `handlers.ts` to keep that file under
 * the 500-line guideline and to give the shortform path resolver a clean
 * home alongside its longform sibling.
 *
 * Resolution rules:
 *
 *   - `longform` / `outline`: prefer the content index (so writingcontrol-
 *     shaped non-template paths work); fall back to the site's
 *     `blogFilenameTemplate` for legacy / pre-doctor entries.
 *   - `shortform`: defers to `resolveShortformFilePath` in `paths.ts`,
 *     which composes the entry directory (via `findEntryFile`) with
 *     `scrapbook/shortform/<platform>[-<channel>].md`.
 *
 * The shortform variant returns `undefined` when the entry has no body file
 * scaffolded yet — the caller decides whether to create the entry directory
 * or surface a 404. The longform variant always returns a path because the
 * slug-template fallback is unconditional for it.
 */

import { existsSync } from 'node:fs';
import type { DeskworkConfig } from '../config.ts';
import type { ContentIndex } from '../content-index.ts';
import { buildContentIndex } from '../content-index.ts';
import {
  findEntryFile,
  resolveBlogFilePath,
  resolveCalendarPath,
  resolveShortformFilePath,
} from '../paths.ts';
import { readCalendar } from '../calendar.ts';
import { findEntry, findEntryById } from '../calendar-mutations.ts';
import type { CalendarEntry, Platform } from '../types.ts';

/**
 * Read a calendar entry by id or slug for a given site, returning
 * `undefined` when the calendar is missing or the entry can't be found.
 */
export function lookupEntry(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  match: { entryId?: string; slug?: string },
): CalendarEntry | undefined {
  try {
    const calendarPath = resolveCalendarPath(projectRoot, config, site);
    if (!existsSync(calendarPath)) return undefined;
    const cal = readCalendar(calendarPath);
    if (match.entryId !== undefined && match.entryId !== '') {
      const byId = findEntryById(cal, match.entryId);
      if (byId !== undefined) return byId;
    }
    if (match.slug !== undefined && match.slug !== '') {
      return findEntry(cal, match.slug);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hint bundle accepted by the longform/outline path resolver. Any one of
 * `entryId`, `entry`, or `index` may be supplied; the resolver fills the
 * rest in.
 */
export interface LongformPathHint {
  entryId?: string;
  entry?: CalendarEntry;
  index?: ContentIndex;
}

/**
 * Resolve the absolute path of the markdown file backing a longform or
 * outline workflow.
 *
 * Precedence:
 *   1. Content index — when an entry id is known (passed in or derived
 *      from the workflow's site+slug via the calendar), look up the file
 *      whose frontmatter `deskwork.id:` matches. Refactor-proof.
 *   2. Slug-template fallback — when no entry id is available (legacy
 *      workflow, pre-doctor entry, ad-hoc draft with no calendar record),
 *      fall back to the site's `blogFilenameTemplate`.
 *
 * Always returns a path (the slug-template fallback is unconditional);
 * callers should `existsSync` if they need existence guarantees.
 */
export function resolveLongformFilePath(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  hint: LongformPathHint,
): string {
  let entry = hint.entry;
  let entryId = hint.entryId;
  if (entry === undefined && (entryId === undefined || entryId === '')) {
    entry = lookupEntry(projectRoot, config, site, { slug });
    entryId = entry?.id;
  } else if (entry === undefined && entryId !== undefined) {
    entry = lookupEntry(projectRoot, config, site, { entryId });
  } else if (entryId === undefined || entryId === '') {
    entryId = entry?.id;
  }

  if (entryId !== undefined && entryId !== '') {
    const idx = hint.index ?? buildContentIndex(projectRoot, config, site);
    const fromIndex = findEntryFile(
      projectRoot,
      config,
      site,
      entryId,
      idx,
      entry !== undefined ? { slug: entry.slug } : { slug },
    );
    if (fromIndex !== undefined) return fromIndex;
  }
  return resolveBlogFilePath(projectRoot, config, site, slug);
}

/**
 * Resolve the absolute path of the markdown file backing a shortform
 * workflow. Returns `undefined` when the entry has no body file
 * scaffolded yet — the entry directory cannot be derived in that case
 * and the caller decides what to do (create the directory tree, or 404).
 */
export function resolveShortformWorkflowFilePath(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  platform: Platform,
  channel: string | undefined,
  hint: LongformPathHint,
): string | undefined {
  let entry = hint.entry;
  let entryId = hint.entryId;
  if (entry === undefined && (entryId === undefined || entryId === '')) {
    entry = lookupEntry(projectRoot, config, site, { slug });
    entryId = entry?.id;
  } else if (entry === undefined && entryId !== undefined) {
    entry = lookupEntry(projectRoot, config, site, { entryId });
  } else if (entryId === undefined || entryId === '') {
    entryId = entry?.id;
  }

  return resolveShortformFilePath(
    projectRoot,
    config,
    site,
    {
      ...(entryId !== undefined && entryId !== '' ? { id: entryId } : {}),
      slug: entry?.slug ?? slug,
    },
    platform,
    channel,
    hint.index,
  );
}
