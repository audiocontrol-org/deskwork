/**
 * deskwork-resume — restore a Paused entry to its prior stage.
 *
 * Reads `pausedFrom` (recorded by `deskwork pause`) and moves the entry
 * back to that stage. Refuses to resume an entry whose `pausedFrom` was
 * lost (e.g. legacy hand-edit) — operator must move the entry by hand
 * in that case. #27.
 *
 * Usage:
 *   deskwork-resume <project-root> [--site <slug>] <slug>
 *
 * Emits a JSON result:
 *   { slug, stage, site, calendarPath }
 */

import { readConfig } from '@deskwork/core/config';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import { findEntry, unpauseEntry } from '@deskwork/core/calendar-mutations';
import { resolveSite, resolveCalendarPath } from '@deskwork/core/paths';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = ['site'] as const;

  const { positional, flags } = parse();

  if (positional.length < 2) {
    fail('Usage: deskwork-resume <project-root> [--site <slug>] <slug>', 2);
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
    const paused = calendar.entries
      .filter((e) => e.stage === 'Paused')
      .map((e) => e.slug)
      .join(', ') || '(none)';
    fail(
      `No calendar entry found with slug "${slug}". Paused entries: ${paused}`,
    );
  }

  let resumed;
  try {
    resumed = unpauseEntry(calendar, slug);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  writeCalendar(calendarPath, calendar);

  emit({
    slug: resumed.slug,
    title: resumed.title,
    stage: resumed.stage,
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
