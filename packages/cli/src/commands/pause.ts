/**
 * deskwork-pause — move a non-terminal entry to Paused.
 *
 * Records the prior stage on `pausedFrom` so `deskwork resume` can put
 * the entry back where it came from. Refuses to pause Published or
 * already-Paused entries (see core's `pauseEntry`). #27.
 *
 * Usage:
 *   deskwork-pause <project-root> [--site <slug>] <slug>
 *
 * Emits a JSON result:
 *   { slug, stage: "Paused", pausedFrom, site, calendarPath }
 */

import { readConfig } from '@deskwork/core/config';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import { findEntry, pauseEntry } from '@deskwork/core/calendar-mutations';
import { resolveSite, resolveCalendarPath } from '@deskwork/core/paths';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = ['site'] as const;

  const { positional, flags } = parse();

  if (positional.length < 2) {
    fail('Usage: deskwork-pause <project-root> [--site <slug>] <slug>', 2);
  }

  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

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
      .filter((e) => e.stage !== 'Published' && e.stage !== 'Paused')
      .map((e) => e.slug)
      .join(', ') || '(none)';
    fail(
      `No calendar entry found with slug "${slug}". Pausable entries: ${available}`,
    );
  }

  let paused;
  try {
    paused = pauseEntry(calendar, slug);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  writeCalendar(calendarPath, calendar);

  emit({
    slug: paused.slug,
    title: paused.title,
    stage: paused.stage,
    pausedFrom: paused.pausedFrom,
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
