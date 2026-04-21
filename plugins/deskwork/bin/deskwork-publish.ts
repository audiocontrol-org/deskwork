#!/usr/bin/env tsx
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
import { join } from 'node:path';
import { readConfig } from '../lib/config.ts';
import { readCalendar, writeCalendar } from '../lib/calendar.ts';
import {
  findEntry,
  publishEntry,
  setContentUrl,
} from '../lib/calendar-mutations.ts';
import {
  effectiveContentType,
  hasRepoContent,
  requiresContentUrl,
} from '../lib/types.ts';
import {
  resolveSite,
  resolveCalendarPath,
  resolveContentDir,
} from '../lib/paths.ts';
import { absolutize, emit, fail, parseArgs } from '../lib/cli.ts';

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
  const dir = resolveContentDir(projectRoot, config, site);
  filePath = join(dir, slug, 'index.md');
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
    return parseArgs(process.argv.slice(2), KNOWN_FLAGS);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }
}
