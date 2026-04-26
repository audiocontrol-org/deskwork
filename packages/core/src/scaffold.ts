/**
 * Blog post scaffolder.
 *
 * Creates the markdown file for a calendar entry with YAML frontmatter
 * matching the host project's conventions. Called by the outline skill
 * for entries with `contentType: 'blog'`. YouTube and tool entries
 * skip this step entirely.
 *
 * Knobs (all per-site config):
 *   - blogFilenameTemplate  path template under contentDir. `{slug}` is
 *                           replaced. Default `"{slug}/index.md"`.
 *   - blogLayout            if set, emit `layout: <value>` frontmatter
 *   - blogInitialState      if set, emit `state: <value>` frontmatter
 *                           (typical: `"draft"` to gate prod builds)
 *   - blogOutlineSection    if true, body includes `## Outline` section
 *
 * Author comes from `config.author` (or an explicit override).
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { relative } from 'node:path';
import type { CalendarEntry } from './types.ts';
import type { DeskworkConfig } from './config.ts';
import { resolveSite, resolveBlogFilePath } from './paths.ts';
import { writeFrontmatter } from './frontmatter.ts';

export interface ScaffoldResult {
  /** Absolute path to the created markdown file */
  filePath: string;
  /** Path relative to the project root */
  relativePath: string;
}

/**
 * Create the blog post markdown for a calendar entry.
 *
 * @param projectRoot     Absolute path to the host project
 * @param config          Parsed deskwork config
 * @param site            Site slug; `undefined` / `null` / `""` → defaultSite
 * @param entry           Calendar entry to scaffold
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

  const author = authorOverride ?? config.author;
  if (!author) {
    throw new Error(
      `Cannot scaffold blog post: no author configured. ` +
        `Set "author" at the top level of .deskwork/config.json, or pass an explicit author.`,
    );
  }

  const filePath = resolveBlogFilePath(projectRoot, config, slug, entry.slug);
  const relativePath = relative(projectRoot, filePath);

  if (existsSync(filePath)) {
    throw new Error(`Blog post already exists at ${relativePath}`);
  }

  const dateStr = new Date().toISOString().slice(0, 10);

  const data: Record<string, unknown> = {};
  if (siteCfg.blogLayout) data.layout = siteCfg.blogLayout;
  data.title = entry.title;
  data.description = entry.description;
  data.date = formatDateHuman(dateStr);
  data.datePublished = dateStr;
  data.dateModified = dateStr;
  data.author = author;
  if (siteCfg.blogInitialState) data.state = siteCfg.blogInitialState;

  const body = buildBody(entry.title, siteCfg.blogOutlineSection === true);

  mkdirSync(dirname(filePath), { recursive: true });
  writeFrontmatter(filePath, data, body);

  return { filePath, relativePath };
}

function buildBody(title: string, withOutline: boolean): string {
  const parts: string[] = ['', `# ${title}`, ''];
  if (withOutline) {
    parts.push(
      '## Outline',
      '',
      '<!-- Sketch the shape of the post here before drafting the body. -->',
      '',
    );
  }
  parts.push('<!-- Write your post here -->', '');
  return parts.join('\n');
}

/** Format a date as "Month YYYY" (e.g. "March 2026"). */
function formatDateHuman(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
