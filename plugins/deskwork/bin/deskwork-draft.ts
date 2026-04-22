#!/usr/bin/env tsx
/**
 * deskwork-draft — move an Outlining entry to Drafting.
 *
 * Blog file scaffolding happens in the outline step (see deskwork-outline).
 * By the time this helper runs, the blog markdown already exists with an
 * approved outline. Draft just flips the stage and optionally records a
 * linked GitHub issue number (Claude invokes `gh issue create` separately
 * and passes the resulting number via --issue).
 *
 * Usage:
 *   deskwork-draft <project-root> [--site <slug>] [--issue <n>] <slug>
 *
 * Emits a JSON result:
 *   { slug, stage, contentType, issueNumber?, site, calendarPath }
 */

import { readConfig } from '../lib/config.ts';
import { readCalendar, writeCalendar } from '../lib/calendar.ts';
import { draftEntry, findEntry } from '../lib/calendar-mutations.ts';
import { effectiveContentType } from '../lib/types.ts';
import { resolveSite, resolveCalendarPath } from '../lib/paths.ts';
import { absolutize, emit, fail, parseArgs } from '../lib/cli.ts';

const KNOWN_FLAGS = ['site', 'issue'] as const;

const { positional, flags } = parse();

if (positional.length < 2) {
  fail(
    'Usage: deskwork-draft <project-root> [--site <slug>] [--issue <n>] <slug>',
    2,
  );
}

const [rootArg, slug] = positional;
const projectRoot = absolutize(rootArg);

let issueNumber: number | undefined;
if (flags.issue !== undefined) {
  const n = parseInt(flags.issue, 10);
  if (!Number.isFinite(n) || n <= 0) {
    fail(`Invalid --issue "${flags.issue}". Must be a positive integer.`);
  }
  issueNumber = n;
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
  const outlining = calendar.entries
    .filter((e) => e.stage === 'Outlining')
    .map((e) => e.slug)
    .join(', ') || '(none)';
  fail(
    `No calendar entry found with slug "${slug}". Outlining entries: ${outlining}`,
  );
}

const contentType = effectiveContentType(existing);
const updated = draftEntry(calendar, slug, issueNumber);
writeCalendar(calendarPath, calendar);

emit({
  slug: updated.slug,
  title: updated.title,
  stage: updated.stage,
  contentType,
  issueNumber: updated.issueNumber,
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
