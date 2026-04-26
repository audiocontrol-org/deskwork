/**
 * Path and site resolution against a DeskworkConfig.
 *
 * Every skill that touches disk goes through these helpers so that hardcoded
 * paths — and assumptions about which sites exist — stay out of skill logic.
 */

import { join } from 'node:path';
import type { DeskworkConfig, SiteConfig } from './config.ts';

/**
 * Resolve a user-supplied site argument to a configured site slug.
 *
 * An empty / null / undefined value falls back to `config.defaultSite`.
 * An unknown value throws with the list of configured sites.
 */
export function resolveSite(
  config: DeskworkConfig,
  site: string | null | undefined,
): string {
  if (site === null || site === undefined || site === '') {
    return config.defaultSite;
  }
  if (!(site in config.sites)) {
    const known = Object.keys(config.sites).join(', ');
    throw new Error(
      `Unknown site "${site}". Configured sites: ${known}. ` +
        `Default when omitted: ${config.defaultSite}.`,
    );
  }
  return site;
}

/** Internal: resolve + look up the SiteConfig for a given argument. */
function siteConfig(config: DeskworkConfig, site: string | null | undefined): SiteConfig {
  const slug = resolveSite(config, site);
  return config.sites[slug];
}

/** Absolute path to the site's editorial calendar file. */
export function resolveCalendarPath(
  projectRoot: string,
  config: DeskworkConfig,
  site?: string | null,
): string {
  return join(projectRoot, siteConfig(config, site).calendarPath);
}

/** Absolute path to the site's channels file, or undefined when the site declares none. */
export function resolveChannelsPath(
  projectRoot: string,
  config: DeskworkConfig,
  site?: string | null,
): string | undefined {
  const entry = siteConfig(config, site);
  return entry.channelsPath === undefined
    ? undefined
    : join(projectRoot, entry.channelsPath);
}

/** Absolute path to the site's blog content directory. */
export function resolveContentDir(
  projectRoot: string,
  config: DeskworkConfig,
  site?: string | null,
): string {
  return join(projectRoot, siteConfig(config, site).contentDir);
}

/** Bare public hostname for the site (no protocol). */
export function resolveSiteHost(
  config: DeskworkConfig,
  site?: string | null,
): string {
  return siteConfig(config, site).host;
}

/** Canonical public base URL for the site, with trailing slash. */
export function resolveSiteBaseUrl(
  config: DeskworkConfig,
  site?: string | null,
): string {
  return `https://${resolveSiteHost(config, site)}/`;
}

const DEFAULT_BLOG_FILENAME_TEMPLATE = '{slug}/index.md';

/**
 * Absolute path to the blog post markdown for a given slug.
 *
 * Resolution order (first match wins):
 *   1. Explicit `filePath` argument — joined with the site's `contentDir`.
 *      Set this when an entry stores its own `filePath` (e.g. a flat
 *      `characters/alice.md` next to `characters/bob.md`, or a `README.md`
 *      instead of `index.md` on a nested editorial-private node).
 *   2. The site's configured `blogFilenameTemplate` (default
 *      `{slug}/index.md`). Audiocontrol-shaped flat blogs hit this path.
 *
 * The scaffolder and publish helper both go through this to stay in
 * sync on where a blog post lives.
 */
export function resolveBlogFilePath(
  projectRoot: string,
  config: DeskworkConfig,
  site: string | null | undefined,
  slug: string,
  filePath?: string,
): string {
  const entry = siteConfig(config, site);
  if (filePath !== undefined && filePath !== '') {
    return join(projectRoot, entry.contentDir, filePath);
  }
  const template = entry.blogFilenameTemplate ?? DEFAULT_BLOG_FILENAME_TEMPLATE;
  return join(projectRoot, entry.contentDir, template.replaceAll('{slug}', slug));
}

/**
 * Absolute path to the per-post directory for a slug —
 * `<contentDir>/<slug>/`. Used by features that co-locate per-post
 * artifacts (scrapbook, feature images) regardless of whether the
 * blog markdown lives at `<slug>/index.md` or as a flat `<slug>.md`.
 *
 * The directory is not guaranteed to exist. Callers that need it
 * created should `mkdirSync({ recursive: true })`.
 */
export function resolveBlogPostDir(
  projectRoot: string,
  config: DeskworkConfig,
  site: string | null | undefined,
  slug: string,
): string {
  return join(projectRoot, siteConfig(config, site).contentDir, slug);
}
