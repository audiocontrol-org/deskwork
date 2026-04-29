/**
 * deskwork-outline — move a Planned entry to Outlining.
 *
 * For blog entries, scaffolds the blog post markdown with frontmatter +
 * (optionally) a `## Outline` section so the operator can shape the
 * piece before the agent drafts the body. For youtube/tool entries,
 * no filesystem artifact is created — the stage flip to Outlining
 * still happens (the pipeline expects every content type to pass
 * through Outlining before Drafting).
 *
 * Usage:
 *   deskwork-outline <project-root> [--site <slug>] [--author "Name"] <slug>
 *
 * Emits a JSON result:
 *   { slug, stage, contentType, scaffolded: {filePath, relativePath} | null,
 *     site, calendarPath }
 */

import { readConfig } from '@deskwork/core/config';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import { outlineEntry, findEntry } from '@deskwork/core/calendar-mutations';
import {
  scaffoldBlogPost,
  type ScaffoldLayout,
  type ScaffoldResult,
} from '@deskwork/core/scaffold';
import {
  effectiveContentType,
  hasRepoContent,
} from '@deskwork/core/types';
import { resolveSite, resolveCalendarPath } from '@deskwork/core/paths';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = ['site', 'author', 'layout'] as const;
  const VALID_LAYOUTS: readonly ScaffoldLayout[] = ['index', 'readme', 'flat'];

  const { positional, flags } = parse();

  if (positional.length < 2) {
    fail(
      'Usage: deskwork-outline <project-root> [--site <slug>] [--author "Name"] ' +
        '[--layout index|readme|flat] <slug>',
      2,
    );
  }
  if (
    flags.layout !== undefined &&
    !(VALID_LAYOUTS as readonly string[]).includes(flags.layout)
  ) {
    fail(
      `--layout must be one of ${VALID_LAYOUTS.join(', ')} (got "${flags.layout}")`,
      2,
    );
  }
  const layout = flags.layout as ScaffoldLayout | undefined;

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

  // Preflight: find the entry and verify stage before writing anything.
  const existing = findEntry(calendar, slug);
  if (!existing) {
    const planned = calendar.entries
      .filter((e) => e.stage === 'Planned')
      .map((e) => e.slug)
      .join(', ') || '(none)';
    fail(`No calendar entry found with slug "${slug}". Planned entries: ${planned}`);
  }
  if (existing.stage !== 'Planned') {
    fail(
      `Entry "${slug}" is in stage "${existing.stage}" — must be in Planned to outline.`,
    );
  }

  const contentType = effectiveContentType(existing);
  let scaffolded: ScaffoldResult | null = null;
  if (hasRepoContent(contentType)) {
    const opts: Parameters<typeof scaffoldBlogPost>[4] = {};
    if (flags.author !== undefined) opts.authorOverride = flags.author;
    if (layout !== undefined) opts.layout = layout;
    try {
      scaffolded = scaffoldBlogPost(projectRoot, config, site, existing, opts);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  // Phase 19a removed CalendarEntry.filePath — path-encoding lives in
  // the scaffolded file's frontmatter `id:` and is resolved through
  // the content index at read time. The scaffolder still reports
  // `contentRelativePath` in its result for the JSON emit so the
  // caller can show the operator where the file was created.

  const updated = outlineEntry(calendar, slug);
  writeCalendar(calendarPath, calendar);

  emit({
    slug: updated.slug,
    title: updated.title,
    stage: updated.stage,
    contentType,
    scaffolded,
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
