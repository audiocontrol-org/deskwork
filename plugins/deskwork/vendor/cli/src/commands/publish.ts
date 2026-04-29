/**
 * deskwork-publish — mark a Drafting/Review entry as Published.
 *
 * For blog entries, the helper verifies that `<contentDir>/<slug>/index.md`
 * exists — refusing to publish a post whose file hasn't been written. For
 * youtube/tool entries, the helper requires `contentUrl` to be set on the
 * entry; if it's missing, pass --content-url to set it in the same call.
 *
 * Usage:
 *   deskwork-publish <project-root> [--site <slug>] [--date YYYY-MM-DD]
 *                    [--content-url URL] <slug>
 *
 * Emits a JSON result:
 *   { slug, stage: "Published", datePublished, contentType, contentUrl?,
 *     issueNumber?, filePath?, site, calendarPath }
 */

import { existsSync } from 'node:fs';
import { readConfig } from '@deskwork/core/config';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import {
  findEntry,
  publishEntry,
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

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = ['site', 'date', 'content-url'] as const;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const { positional, flags } = parse();

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

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const site = resolveSite(config, flags.site);
  const calendarPath = resolveCalendarPath(projectRoot, config, site);
  const calendar = readCalendar(calendarPath);

  const existing = findEntry(calendar, slug);
  if (!existing) {
    const available = calendar.entries
      .filter((e) => e.stage !== 'Published')
      .map((e) => e.slug)
      .join(', ') || '(none)';
    fail(`No calendar entry found with slug "${slug}". Non-Published entries: ${available}`);
  }
  if (existing.stage === 'Published') {
    fail(`Entry "${slug}" is already Published (date: ${existing.datePublished}).`);
  }

  const contentType = effectiveContentType(existing);

  // Persist a late-set content URL before validating.
  if (flags['content-url'] !== undefined) {
    setContentUrl(calendar, slug, flags['content-url']);
  }

  let filePath: string | undefined;
  if (hasRepoContent(contentType)) {
    // Prefer the UUID-bound path so a refactored / non-template file
    // location is honored (Issue #67). The slug-template fallback is
    // automatic when no UUID binding exists.
    filePath = resolveEntryFilePath(
      projectRoot,
      config,
      site,
      slug,
      existing.id,
    );
    if (!existsSync(filePath)) {
      fail(
        `Cannot publish blog post "${slug}": no file at ${filePath}. ` +
          `Write the post before publishing.`,
      );
    }
  } else if (requiresContentUrl(contentType)) {
    // Re-read after possible setContentUrl mutation above.
    const updated = findEntry(calendar, slug)!;
    if (!updated.contentUrl) {
      fail(
        `Cannot publish ${contentType} entry "${slug}": contentUrl is not set. ` +
          `Pass --content-url <URL> to set it.`,
      );
    }
  }

  const published = publishEntry(calendar, slug, flags.date);
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

  function parse() {
    try {
      return parseArgs(argv, KNOWN_FLAGS);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), 2);
    }
  }
}
