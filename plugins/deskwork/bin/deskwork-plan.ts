#!/usr/bin/env tsx
/**
 * deskwork-plan — move an Ideas entry to Planned and set target keywords.
 *
 * Usage:
 *   deskwork-plan <project-root> [--site <slug>] [--topics t1,t2,...]
 *                 <slug> [<keyword1> <keyword2> ...]
 *
 * Keywords may be passed as separate positionals or a single
 * comma-separated string. Emits a JSON result with the updated entry.
 */

import { readConfig } from '@deskwork/core/config';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import { planEntry } from '@deskwork/core/calendar-mutations';
import { resolveSite, resolveCalendarPath } from '@deskwork/core/paths';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';

const KNOWN_FLAGS = ['site', 'topics'] as const;

const { positional, flags } = parse();

if (positional.length < 2) {
  fail(
    'Usage: deskwork-plan <project-root> [--site <slug>] [--topics t1,t2,...] ' +
      '<slug> [<keyword1> <keyword2> ...]',
    2,
  );
}

const [rootArg, slug, ...keywordArgs] = positional;
const projectRoot = absolutize(rootArg);

// Accept "a, b, c" as a single arg or separate positionals. Both shapes
// collapse to a flat string[] of non-empty trimmed keywords.
const keywords = keywordArgs
  .flatMap((k) => k.split(','))
  .map((k) => k.trim())
  .filter((k) => k.length > 0);

let topics: string[] | undefined;
if (flags.topics !== undefined) {
  topics = flags.topics
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
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

let entry;
try {
  entry = planEntry(calendar, slug, keywords, topics ? { topics } : undefined);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

writeCalendar(calendarPath, calendar);

emit({
  slug: entry.slug,
  title: entry.title,
  stage: entry.stage,
  targetKeywords: entry.targetKeywords,
  topics: entry.topics,
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
