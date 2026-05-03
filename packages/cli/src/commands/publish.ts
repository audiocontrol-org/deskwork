/**
 * deskwork-publish — mark a Final entry as Published.
 *
 * Phase 29 / pipeline redesign: entry-centric publish goes through the
 * `publishEntry` core helper, which writes the sidecar's currentStage
 * to 'Published', stamps `datePublished`, emits a stage-transition
 * journal event, and regenerates calendar.md (#148).
 *
 * Dispatcher: when the slug resolves to an entry sidecar, route to the
 * entry-centric path. Otherwise (legacy data without sidecars,
 * shortform-style externally-hosted content using `--content-url`),
 * fall through to the legacy calendar-mutation path which preserves
 * the pre-Phase-30 behavior verbatim.
 *
 * Usage:
 *   deskwork-publish <project-root> [--site <slug>] [--date YYYY-MM-DD]
 *                    [--content-url URL] <slug>
 *
 * Emits a JSON result. Entry-centric path:
 *   { entryId, slug, fromStage, toStage: "Published", datePublished,
 *     site, calendarPath, filePath? }
 * Legacy path (unchanged):
 *   { slug, title, stage, datePublished, contentType, contentUrl?,
 *     issueNumber?, filePath?, site, calendarPath }
 */

import { existsSync } from 'node:fs';
import { readConfig } from '@deskwork/core/config';
import type { DeskworkConfig } from '@deskwork/core/config';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import {
  findEntry,
  publishEntry as publishCalendarEntry,
  setContentUrl,
} from '@deskwork/core/calendar-mutations';
import {
  effectiveContentType,
  hasRepoContent,
  requiresContentUrl,
} from '@deskwork/core/types';
import {
  resolveSite,
  resolveCalendarPath,
  resolveEntryFilePath,
} from '@deskwork/core/paths';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';
import { publishEntry as publishEntrySidecar } from '@deskwork/core/entry/publish';
import { resolveEntryUuid } from '@deskwork/core/sidecar';

const KNOWN_FLAGS = ['site', 'date', 'content-url'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function run(argv: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs(argv, KNOWN_FLAGS);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }

  const { positional, flags } = parsed;

  if (positional.length < 2) {
    fail(
      'Usage: deskwork-publish <project-root> [--site <slug>] [--date YYYY-MM-DD] ' +
        '[--content-url URL] <slug>',
      2,
    );
  }

  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

  if (flags.date !== undefined && !DATE_RE.test(flags.date)) {
    fail(`Invalid --date "${flags.date}". Must match YYYY-MM-DD.`);
  }

  let config: DeskworkConfig;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const site = resolveSite(config, flags.site);

  // Try entry-centric path first. The slug-to-uuid resolver returns a
  // structured error when no sidecar is bound; fall through to legacy
  // only on that error so the rest of the publish pipeline still
  // surfaces real problems (bad slug, missing artifact, etc.).
  const uuid = await tryResolveEntryUuid(projectRoot, slug);

  if (uuid !== undefined) {
    // Entry-centric path. The new model doesn't have content-type info
    // on the sidecar — content-url is a legacy-only concern, so we
    // refuse to mix it with entry-centric publish to avoid silent
    // drops. If an operator needs --content-url, they're on the
    // legacy data path.
    if (flags['content-url'] !== undefined) {
      fail(
        '--content-url is not supported on entry-centric entries. ' +
          'Set contentUrl via the calendar mutation path before migrating.',
      );
    }

    let result;
    try {
      result = await publishEntrySidecar(projectRoot, {
        uuid,
        ...(flags.date !== undefined ? { date: flags.date } : {}),
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }

    emit({
      entryId: result.entryId,
      site,
      slug,
      fromStage: result.fromStage,
      toStage: result.toStage,
      datePublished: result.datePublished,
      calendarPath: resolveCalendarPath(projectRoot, config, site),
      ...(result.artifactPath !== undefined ? { filePath: result.artifactPath } : {}),
    });
    return;
  }

  // Legacy path — unchanged.
  await runLegacyPublish(projectRoot, config, site, slug, flags);
}

async function tryResolveEntryUuid(
  projectRoot: string,
  slug: string,
): Promise<string | undefined> {
  try {
    return await resolveEntryUuid(projectRoot, slug);
  } catch {
    return undefined;
  }
}

async function runLegacyPublish(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  flags: Record<string, string>,
): Promise<void> {
  const calendarPath = resolveCalendarPath(projectRoot, config, site);
  const calendar = readCalendar(calendarPath);

  const existing = findEntry(calendar, slug);
  if (!existing) {
    const available =
      calendar.entries
        .filter((e) => e.stage !== 'Published')
        .map((e) => e.slug)
        .join(', ') || '(none)';
    fail(
      `No calendar entry found with slug "${slug}". Non-Published entries: ${available}`,
    );
  }
  if (existing.stage === 'Published') {
    fail(`Entry "${slug}" is already Published (date: ${existing.datePublished}).`);
  }

  const contentType = effectiveContentType(existing);

  if (flags['content-url'] !== undefined) {
    setContentUrl(calendar, slug, flags['content-url']);
  }

  let filePath: string | undefined;
  if (hasRepoContent(contentType)) {
    filePath = resolveEntryFilePath(projectRoot, config, site, slug, existing.id);
    if (!existsSync(filePath)) {
      fail(
        `Cannot publish blog post "${slug}": no file at ${filePath}. ` +
          `Write the post before publishing.`,
      );
    }
  } else if (requiresContentUrl(contentType)) {
    const updated = findEntry(calendar, slug)!;
    if (!updated.contentUrl) {
      fail(
        `Cannot publish ${contentType} entry "${slug}": contentUrl is not set. ` +
          `Pass --content-url <URL> to set it.`,
      );
    }
  }

  const published = publishCalendarEntry(calendar, slug, flags.date);
  writeCalendar(calendarPath, calendar);

  emit({
    slug: published.slug,
    title: published.title,
    stage: published.stage,
    datePublished: published.datePublished,
    contentType,
    contentUrl: published.contentUrl,
    issueNumber: published.issueNumber,
    filePath,
    site,
    calendarPath,
  });
}
