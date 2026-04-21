#!/usr/bin/env tsx
/**
 * deskwork-add — append a new idea to the editorial calendar.
 *
 * Usage:
 *   deskwork-add <project-root> [--site <slug>] [--type blog|youtube|tool]
 *                [--content-url URL] [--source manual|analytics]
 *                <title> [description]
 *
 * Writes the calendar atomically. Emits a JSON result on stdout:
 *   { "slug": "...", "stage": "Ideas", "site": "...", "calendarPath": "..." }
 */

import { readConfig } from '../lib/config.ts';
import { readCalendar, writeCalendar } from '../lib/calendar.ts';
import { addEntry } from '../lib/calendar-mutations.ts';
import { resolveSite, resolveCalendarPath } from '../lib/paths.ts';
import { isContentType, type ContentType } from '../lib/types.ts';
import { absolutize, emit, fail, parseArgs } from '../lib/cli.ts';

const KNOWN_FLAGS = ['site', 'type', 'content-url', 'source'] as const;

const { positional, flags } = parse();

if (positional.length < 2) {
  fail(
    'Usage: deskwork-add <project-root> [--site <slug>] [--type blog|youtube|tool] ' +
      '[--content-url URL] [--source manual|analytics] <title> [description]',
    2,
  );
}

const [rootArg, title, ...rest] = positional;
const description = rest.join(' ').trim();
const projectRoot = absolutize(rootArg);

let config;
try {
  config = readConfig(projectRoot);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

const site = resolveSite(config, flags.site);
const calendarPath = resolveCalendarPath(projectRoot, config, site);

let contentType: ContentType | undefined;
if (flags.type !== undefined) {
  if (!isContentType(flags.type)) {
    fail(`Invalid --type "${flags.type}". Must be one of: blog, youtube, tool.`);
  }
  contentType = flags.type;
}

let source: 'manual' | 'analytics' = 'manual';
if (flags.source !== undefined) {
  if (flags.source !== 'manual' && flags.source !== 'analytics') {
    fail(`Invalid --source "${flags.source}". Must be "manual" or "analytics".`);
  }
  source = flags.source;
}

const calendar = readCalendar(calendarPath);

let entry;
try {
  entry = addEntry(calendar, title, {
    description,
    source,
    ...(contentType !== undefined ? { contentType } : {}),
    ...(flags['content-url'] !== undefined ? { contentUrl: flags['content-url'] } : {}),
  });
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

writeCalendar(calendarPath, calendar);

emit({
  slug: entry.slug,
  title: entry.title,
  stage: entry.stage,
  description: entry.description,
  site,
  calendarPath,
  contentType: entry.contentType,
  contentUrl: entry.contentUrl,
});

function parse() {
  try {
    return parseArgs(process.argv.slice(2), KNOWN_FLAGS);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }
}
