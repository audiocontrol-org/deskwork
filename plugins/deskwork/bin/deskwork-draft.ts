#!/usr/bin/env tsx
/**
 * deskwork-draft — move a Planned entry to Drafting.
 *
 * For blog entries, scaffolds a blog post directory with an `index.md` and
 * YAML frontmatter. For youtube/tool entries, no filesystem artifact is
 * created — the content lives outside the repo. In either case the
 * calendar entry's stage flips to Drafting.
 *
 * GitHub issue creation is intentionally outside this helper's scope —
 * the calling skill invokes `gh issue create` and may pass the resulting
 * issue number via --issue to persist it on the calendar entry.
 *
 * Usage:
 *   deskwork-draft <project-root> [--site <slug>] [--issue <n>]
 *                  [--author "Name"] <slug>
 *
 * Emits a JSON result:
 *   { slug, stage, contentType, scaffolded: {filePath, relativePath} | null,
 *     issueNumber?, site, calendarPath }
 */

import { readConfig } from '../lib/config.ts';
import { readCalendar, writeCalendar } from '../lib/calendar.ts';
import { draftEntry, findEntry } from '../lib/calendar-mutations.ts';
import { scaffoldBlogPost, type ScaffoldResult } from '../lib/scaffold.ts';
import {
  effectiveContentType,
  hasRepoContent,
} from '../lib/types.ts';
import { resolveSite, resolveCalendarPath } from '../lib/paths.ts';
import { absolutize, emit, fail, parseArgs } from '../lib/cli.ts';

const KNOWN_FLAGS = ['site', 'issue', 'author'] as const;

const { positional, flags } = parse();

if (positional.length < 2) {
  fail(
    'Usage: deskwork-draft <project-root> [--site <slug>] [--issue <n>] ' +
      '[--author "Name"] <slug>',
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

// Preflight: find the entry and verify stage before scaffolding anything.
// We do not want the blog file created if the calendar state is wrong.
const existing = findEntry(calendar, slug);
if (!existing) {
  const available = calendar.entries.map((e) => e.slug).join(', ') || '(none)';
  fail(`No calendar entry found with slug "${slug}". Available: ${available}`);
}
if (existing.stage !== 'Planned') {
  fail(
    `Entry "${slug}" is in stage "${existing.stage}" — must be in Planned to draft.`,
  );
}

const contentType = effectiveContentType(existing);
let scaffolded: ScaffoldResult | null = null;
if (hasRepoContent(contentType)) {
  try {
    scaffolded = scaffoldBlogPost(
      projectRoot,
      config,
      site,
      existing,
      flags.author,
    );
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

const updated = draftEntry(calendar, slug, issueNumber);
writeCalendar(calendarPath, calendar);

emit({
  slug: updated.slug,
  title: updated.title,
  stage: updated.stage,
  contentType,
  scaffolded,
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
