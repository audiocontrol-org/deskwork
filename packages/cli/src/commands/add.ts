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

import { readConfig } from '@deskwork/core/config';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import { addEntry } from '@deskwork/core/calendar-mutations';
import { resolveSite, resolveCalendarPath } from '@deskwork/core/paths';
import { isContentType, type ContentType } from '@deskwork/core/types';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';
import { createFreshEntrySidecar } from '@deskwork/core/entry/create';

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = ['site', 'type', 'content-url', 'source', 'slug'] as const;
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

  const { positional, flags } = parse();

  if (positional.length < 2) {
    fail(
      'Usage: deskwork-add <project-root> [--site <slug>] [--type blog|youtube|tool] ' +
        '[--content-url URL] [--source manual|analytics] [--slug <path>] ' +
        '<title> [description]',
      2,
    );
  }
  if (flags.slug !== undefined && !SLUG_RE.test(flags.slug)) {
    fail(
      `--slug must be one or more /-separated kebab-case segments ` +
        `(got "${flags.slug}")`,
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
      ...(flags.slug !== undefined ? { slug: flags.slug } : {}),
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  writeCalendar(calendarPath, calendar);

  // #184: write the entry-centric sidecar so calendar.md and
  // .deskwork/entries/<uuid>.json stay aligned per the Phase 30 SSOT
  // contract. Shared with `deskwork ingest --apply` (#183) via
  // createFreshEntrySidecar.
  if (entry.id === undefined) {
    // addEntry always mints a UUID (CalendarEntry.id is `string | undefined`
    // only because pre-id legacy test fixtures need to compile — runtime
    // adds always populate it). Fail loudly if that contract breaks
    // rather than emitting a sidecar with an empty uuid.
    fail('addEntry returned an entry without an id (programmer error)');
  }
  await createFreshEntrySidecar(projectRoot, {
    uuid: entry.id,
    slug: entry.slug,
    title: entry.title,
    ...(entry.description ? { description: entry.description } : {}),
    currentStage: 'Ideas',
    source,
  });

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
      return parseArgs(argv, KNOWN_FLAGS);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), 2);
    }
  }
}
