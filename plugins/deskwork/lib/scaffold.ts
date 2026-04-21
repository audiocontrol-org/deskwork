/**
 * Blog post scaffolder.
 *
 * Creates a new blog post directory and `index.md` with YAML frontmatter
 * matching the host project's site layout. Called by the draft skill for
 * calendar entries with `contentType: 'blog'`. YouTube and tool entries
 * skip this step entirely.
 *
 * The author comes from `config.author` (or an explicit override); the
 * layout string comes from the site's `blogLayout` config field. Both
 * must be configured — this function throws with an actionable message
 * when either is missing, rather than silently writing a half-filled
 * frontmatter block.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CalendarEntry } from './types.ts';
import type { DeskworkConfig } from './config.ts';
import { resolveSite } from './paths.ts';
import { writeFrontmatter } from './frontmatter.ts';

export interface ScaffoldResult {
  /** Absolute path to the created index.md */
  filePath: string;
  /** Path relative to the project root */
  relativePath: string;
}

/**
 * Create a blog post directory and `index.md` from a calendar entry.
 *
 * @param projectRoot  Absolute path to the host project
 * @param config       Parsed deskwork config
 * @param site         Site slug; `undefined` / `null` / `""` → defaultSite
 * @param entry        Calendar entry to scaffold
 * @param authorOverride  Optional — overrides `config.author` for this post
 */
export function scaffoldBlogPost(
  projectRoot: string,
  config: DeskworkConfig,
  site: string | null | undefined,
  entry: CalendarEntry,
  authorOverride?: string,
): ScaffoldResult {
  const slug = resolveSite(config, site);
  const siteCfg = config.sites[slug];

  if (!siteCfg.blogLayout) {
    throw new Error(
      `Cannot scaffold blog post: site "${slug}" has no "blogLayout" configured. ` +
        `Add a blogLayout field to the site's config entry in .deskwork/config.json ` +
        `(typically a relative path like "../../layouts/BlogLayout.astro").`,
    );
  }

  const author = authorOverride ?? config.author;
  if (!author) {
    throw new Error(
      `Cannot scaffold blog post: no author configured. ` +
        `Set "author" at the top level of .deskwork/config.json, or pass an explicit author.`,
    );
  }

  const relativePath = join(siteCfg.contentDir, entry.slug, 'index.md');
  const filePath = join(projectRoot, relativePath);

  if (existsSync(filePath)) {
    throw new Error(`Blog post already exists at ${relativePath}`);
  }

  const dateStr = new Date().toISOString().slice(0, 10);

  const data: Record<string, unknown> = {
    layout: siteCfg.blogLayout,
    title: entry.title,
    description: entry.description,
    date: formatDateHuman(dateStr),
    datePublished: dateStr,
    dateModified: dateStr,
    author,
  };

  const body = [
    '',
    `# ${entry.title}`,
    '',
    '<!-- Write your post here -->',
    '',
  ].join('\n');

  mkdirSync(dirname(filePath), { recursive: true });
  writeFrontmatter(filePath, data, body);

  return { filePath, relativePath };
}

/** Format a date as "Month YYYY" (e.g. "March 2026"). */
function formatDateHuman(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
