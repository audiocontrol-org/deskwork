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
import { dirname, join, relative } from 'node:path';
import type { CalendarEntry } from './types.ts';
import type { DeskworkConfig } from './config.ts';
import { resolveSite, resolveBlogFilePath } from './paths.ts';
import { writeFrontmatter } from './frontmatter.ts';

export interface ScaffoldResult {
  /** Absolute path to the created markdown file */
  filePath: string;
  /** Path relative to the project root */
  relativePath: string;
  /**
   * Path of the file relative to `contentDir` — the value to record on
   * the calendar entry so subsequent reads can find this file even
   * when its layout differs from the site's `blogFilenameTemplate`.
   */
  contentRelativePath: string;
}

/** Layout options for `scaffoldBlogPost`. Picks the on-disk shape. */
export type ScaffoldLayout = 'index' | 'readme' | 'flat';

export interface ScaffoldOptions {
  /** Override `config.author` for this post. */
  authorOverride?: string;
  /**
   * Pick the on-disk shape of the scaffolded file. When omitted, falls
   * back to the site's `blogFilenameTemplate` (preserving legacy
   * audiocontrol behavior).
   *
   * - `'index'` → `<slug>/index.md` (hub-style, public route in most
   *   single-level Astro patterns)
   * - `'readme'` → `<slug>/README.md` (editorial-private — directory
   *   exists, but content collections that match `*\/index.md` won't
   *   pick it up)
   * - `'flat'` → `<slug>.md` (a sibling file at the parent dir, no
   *   own directory; useful for many small chapters under one parent)
   */
  layout?: ScaffoldLayout;
}

/**
 * Create the blog post markdown for a calendar entry.
 */
export function scaffoldBlogPost(
  projectRoot: string,
  config: DeskworkConfig,
  site: string | null | undefined,
  entry: CalendarEntry,
  opts: ScaffoldOptions = {},
): ScaffoldResult {
  const slug = resolveSite(config, site);
  const siteCfg = config.sites[slug];

  const author = opts.authorOverride ?? config.author;
  if (!author) {
    throw new Error(
      `Cannot scaffold blog post: no author configured. ` +
        `Set "author" at the top level of .deskwork/config.json, or pass an explicit author.`,
    );
  }

  // When a layout is requested, compute the contentDir-relative path
  // explicitly. Otherwise fall back to the site template.
  const contentRelativePath = opts.layout
    ? layoutToContentRelativePath(opts.layout, entry.slug)
    : undefined;
  const filePath = resolveBlogFilePath(
    projectRoot,
    config,
    slug,
    entry.slug,
    contentRelativePath,
  );
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

  // Always report the contentDir-relative path. When no explicit layout
  // was requested we derive it from the resolved file path so the caller
  // can record `entry.filePath` consistently regardless of which
  // resolution branch produced filePath.
  const reported =
    contentRelativePath ??
    relative(join(projectRoot, siteCfg.contentDir), filePath);
  return { filePath, relativePath, contentRelativePath: reported };
}

/** Map a ScaffoldLayout + slug to the contentDir-relative file path. */
function layoutToContentRelativePath(
  layout: ScaffoldLayout,
  slug: string,
): string {
  switch (layout) {
    case 'index':
      return `${slug}/index.md`;
    case 'readme':
      return `${slug}/README.md`;
    case 'flat':
      return `${slug}.md`;
  }
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
