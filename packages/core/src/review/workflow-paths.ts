/**
 * Workflow → on-disk markdown file resolution.
 *
 * Both `handleStartLongform` and `handleCreateVersion` need to translate a
 * (site, slug, contentKind, entryId?, platform?, channel?) tuple into an
 * absolute file path. Pulled out of `handlers.ts` to keep that file under
 * the 500-line guideline and to give the shortform path resolver a clean
 * home alongside its longform sibling.
 *
 * Resolution rules (Phase 39c-2b(a) — stored artifactPath only):
 *
 *   - `longform` / `outline`: `resolveArtifactPathOrThrow` on the entry's
 *     stored `artifactPath` (refined to a sibling `index.md` when present).
 *   - `shortform`: `composeShortformDraftPath` — `scrapbook/shortform/
 *     <platform>[-<channel>].md` under the parent entry's artifactPath dir.
 *
 * Both load the entry sidecar from the workflow's id (or the calendar by
 * slug). There is NO content-index / slug-template fallback; an entry with
 * no derivable id or no `artifactPath` throws with `doctor --fix` guidance.
 */

import { existsSync } from 'node:fs';
import type { DeskworkConfig } from '../config.ts';
import type { ContentIndex } from '../content-index.ts';
import { resolveCalendarPath } from '../paths.ts';
import { readCalendar } from '../calendar.ts';
import { findEntry, findEntryById } from '../calendar-mutations.ts';
import type { CalendarEntry, Platform } from '../types.ts';
import type { Entry } from '../schema/entry.ts';
import { readSidecarSync } from '../sidecar/read.ts';
import { resolveArtifactPathOrThrow } from '../entry/resolve-artifact.ts';
import { composeShortformDraftPath } from '../entry/shortform-path.ts';

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
 * Load the entry SIDECAR backing a workflow, resolving its stable id
 * from the hint or the calendar (Phase 39c-2b(a)).
 *
 * Resolution reads the entry's stored `artifactPath` only — so the
 * sidecar is the input the path resolvers need. The id is taken from
 * `hint.entryId` / `hint.entry.id`, else derived from the calendar by
 * slug. An entry with no derivable id, or no sidecar on disk, is an
 * unmigrated state: this throws with `doctor --fix` guidance rather than
 * falling back to a slug+stage search (the location-as-key disease this
 * retirement removes).
 */
function loadWorkflowEntrySidecar(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  hint: LongformPathHint,
): Entry {
  // Resolution prefers the ACTUAL entry backing the slug (the looked-up
  // calendar entry) over a caller-supplied `entryId` — the latter is a
  // provenance override for stamping the workflow, not a resolution key
  // (a caller can stamp a sibling-calendar id while the file still lives
  // under the real entry's artifactPath). The save path passes only
  // `entryId` (no `entry`), where it IS the resolution key.
  let entryId =
    hint.entry?.id ??
    (hint.entryId !== undefined && hint.entryId !== '' ? hint.entryId : undefined);
  if (entryId === undefined || entryId === '') {
    entryId = lookupEntry(projectRoot, config, site, { slug })?.id;
  }
  if (entryId === undefined || entryId === '') {
    throw new Error(
      `Cannot resolve workflow file for slug "${slug}": no entry id could be ` +
        `derived from the calendar. Resolution reads the stored artifactPath ` +
        `only — there is no slug+stage fallback. Run \`deskwork doctor --fix\` ` +
        `to bind the entry, then retry.`,
    );
  }
  try {
    return readSidecarSync(projectRoot, entryId);
  } catch {
    throw new Error(
      `Cannot resolve workflow file for slug "${slug}" (entry ${entryId}): no ` +
        `entry sidecar on disk. Resolution reads the stored artifactPath only — ` +
        `there is no slug+stage fallback. Run \`deskwork doctor --fix\` to ` +
        `migrate this entry, then retry.`,
    );
  }
}

/**
 * Resolve the absolute path of the markdown file backing a longform or
 * outline workflow, from the entry's stored `artifactPath` (Phase
 * 39c-2b(a)). There is NO content-index lookup or slug-template
 * fallback — an entry without a stored path throws `doctor --fix`.
 *
 * Returns the canonical document path (refined to a sibling `index.md`
 * when one exists on disk). Callers should `existsSync` if they need an
 * existence guarantee — the path may name a not-yet-written file.
 */
export function resolveLongformFilePath(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  hint: LongformPathHint,
): string {
  const entry = loadWorkflowEntrySidecar(projectRoot, config, site, slug, hint);
  return resolveArtifactPathOrThrow(entry, projectRoot);
}

/**
 * Resolve the absolute path of the markdown file backing a shortform
 * workflow, COMPOSED from the parent entry's stored `artifactPath`
 * directory (Phase 39c-2b(a), spec AUDIT-35):
 *
 *   <dir-of-parent-artifact>/scrapbook/shortform/<platform>[-<channel>].md
 *
 * Always returns a path (the shortform child path is deterministic once
 * the parent has an `artifactPath`); it does NOT return `undefined` for
 * an un-scaffolded file — the caller scaffolds it in place. An unmigrated
 * parent (no `artifactPath`) throws `doctor --fix`.
 */
export function resolveShortformWorkflowFilePath(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  platform: Platform,
  channel: string | undefined,
  hint: LongformPathHint,
): string {
  const entry = loadWorkflowEntrySidecar(projectRoot, config, site, slug, hint);
  return composeShortformDraftPath(entry, projectRoot, platform, channel);
}
