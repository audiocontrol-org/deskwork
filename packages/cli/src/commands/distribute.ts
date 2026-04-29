/**
 * deskwork distribute — record the URL of a posted shortform.
 *
 * Run AFTER the operator has manually posted an approved shortform to
 * the platform. The helper updates the calendar's distribution record
 * with the share URL (and optional date / notes) so the dashboard
 * matrix shows the cell as covered.
 *
 * Match precedence (handled inside `updateDistributionUrl`):
 *   - `entryId` (preferred — survives slug renames)
 *   - `(slug, platform, channel?)` legacy fallback
 *
 * If no record exists yet for the (slug, platform, channel?) tuple, the
 * helper creates one via `addDistribution`. That call enforces the
 * Published-stage invariant — non-Published entries cannot have
 * distribution records, since deskwork doesn't track shares for posts
 * that haven't shipped yet.
 *
 * Usage:
 *   deskwork distribute <project-root> [--site <slug>]
 *                       --platform <p> [--channel <c>]
 *                       --url <posted-url>
 *                       [--date YYYY-MM-DD] [--notes <text>]
 *                       <slug>
 *
 * Emits a JSON result with the slug, platform, channel (if any), the
 * recorded URL, the resolved dateShared, and notes (if any).
 */

import { readConfig } from '@deskwork/core/config';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import {
  findEntry,
  findEntryById,
  updateDistributionUrl,
} from '@deskwork/core/calendar-mutations';
import { resolveSite, resolveCalendarPath } from '@deskwork/core/paths';
import { isPlatform, PLATFORMS } from '@deskwork/core/types';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = [
    'site',
    'platform',
    'channel',
    'url',
    'date',
    'notes',
  ] as const;
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const { positional, flags } = parse();

  if (positional.length < 2) {
    fail(
      'Usage: deskwork distribute <project-root> [--site <slug>] ' +
        '--platform <p> [--channel <c>] --url <posted-url> ' +
        '[--date YYYY-MM-DD] [--notes <text>] <slug>',
      2,
    );
  }

  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

  if (!SLUG_RE.test(slug)) {
    fail(`invalid slug: ${slug} (must match ${SLUG_RE})`);
  }

  const platform = flags.platform;
  if (platform === undefined) {
    fail(
      `--platform is required. Must be one of: ${PLATFORMS.join(', ')}.`,
      2,
    );
  }
  if (!isPlatform(platform)) {
    fail(
      `Invalid --platform "${platform}". Must be one of: ${PLATFORMS.join(', ')}.`,
    );
  }

  const url = flags.url;
  if (url === undefined || url === '') {
    fail('--url is required (the URL of the posted share).', 2);
  }

  if (flags.date !== undefined && !DATE_RE.test(flags.date)) {
    fail(`Invalid --date "${flags.date}". Must match YYYY-MM-DD.`);
  }

  const channel = flags.channel;
  const dateShared = flags.date;
  const notes = flags.notes;

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  let site: string;
  try {
    site = resolveSite(config, flags.site);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const calendarPath = resolveCalendarPath(projectRoot, config, site);
  const calendar = readCalendar(calendarPath);

  // Resolve entryId from the calendar so the distribution record carries
  // the stable identity. Survives slug renames downstream.
  const entry = findEntryById(calendar, slug) ?? findEntry(calendar, slug);
  if (!entry) {
    const slugs = calendar.entries.map((e) => e.slug).join(', ') || '(none)';
    fail(
      `No calendar entry with slug "${slug}" on site "${site}". ` +
        `Known slugs: ${slugs}.`,
    );
  }

  // Pre-flight the Published-stage invariant. The mutation throws the same
  // way via `addDistribution` when no prior record exists, but we surface
  // a clearer, action-oriented error here before mutating.
  const hasPriorRecord = calendar.distributions.some((d) => {
    if (d.platform !== platform) return false;
    const channelMatches =
      channel === undefined ? !d.channel : (d.channel?.toLowerCase() ?? '') === channel.toLowerCase();
    if (!channelMatches) return false;
    if (entry.id !== undefined && d.entryId === entry.id) return true;
    return d.slug === entry.slug;
  });
  if (!hasPriorRecord && entry.stage !== 'Published') {
    fail(
      `Cannot record distribution for non-Published entry "${entry.slug}" ` +
        `(current stage: ${entry.stage}). Run /deskwork:publish ${entry.slug} first.`,
    );
  }

  let record;
  try {
    record = updateDistributionUrl(
      calendar,
      {
        ...(entry.id !== undefined ? { entryId: entry.id } : {}),
        slug: entry.slug,
        platform,
        ...(channel !== undefined ? { channel } : {}),
      },
      url,
      dateShared,
      notes,
    );
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  writeCalendar(calendarPath, calendar);

  emit({
    slug: record.slug,
    ...(record.entryId !== undefined ? { entryId: record.entryId } : {}),
    platform: record.platform,
    ...(record.channel !== undefined ? { channel: record.channel } : {}),
    url: record.url,
    dateShared: record.dateShared,
    ...(record.notes !== undefined ? { notes: record.notes } : {}),
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
