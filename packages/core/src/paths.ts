/**
 * Path and site resolution against a DeskworkConfig.
 *
 * Every skill that touches disk goes through these helpers so that hardcoded
 * paths — and assumptions about which sites exist — stay out of skill logic.
 *
 * Phase 19c — entry-to-file resolution precedence
 * -----------------------------------------------
 * For locating the markdown file backing a calendar entry, the canonical
 * order is:
 *
 *   1. **Content index** — when an entry id is known, scan
 *      `<contentDir>/` for a markdown file whose frontmatter `id:`
 *      matches. This is refactor-proof: the binding moves with the file
 *      because the id lives inside the file.
 *   2. **Slug-template fallback** — when the index has no record (entry
 *      not bound to frontmatter yet, e.g. pre-doctor state), fall back
 *      to the site's `blogFilenameTemplate` keyed by slug. This
 *      preserves audiocontrol-shaped flat-blog behavior unchanged.
 *
 * `findEntryFile` implements this precedence directly. `resolveBlogFilePath`
 * remains the legacy slug-template-only entry point used by callers that
 * don't have an entry id available (scaffold for new files, doctor's
 * candidate-search by template, the legacy publish path). New code with
 * access to a calendar entry should prefer `findEntryFile`.
 */

import { dirname, join } from 'node:path';
import type { DeskworkConfig, SiteConfig } from './config.ts';
import type { ContentIndex } from './content-index.ts';
import { buildContentIndex } from './content-index.ts';
import type { Platform } from './types.ts';

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

/**
 * Bare public hostname for the site (no protocol). Returns `undefined` for
 * collections that aren't published as a website (no `host` configured).
 * Callers needing a non-undefined value for display should fall back to the
 * site slug; callers needing a real URL should throw if undefined.
 */
export function resolveSiteHost(
  config: DeskworkConfig,
  site?: string | null,
): string | undefined {
  return siteConfig(config, site).host;
}

/**
 * Canonical public base URL for the site, with trailing slash. Throws when
 * the collection has no `host` configured (i.e. is not published as a
 * website) — callers that need a URL must guarantee the collection is a
 * website-rendered one before calling.
 */
export function resolveSiteBaseUrl(
  config: DeskworkConfig,
  site?: string | null,
): string {
  const host = resolveSiteHost(config, site);
  if (host === undefined) {
    const slug = site ?? config.defaultSite;
    throw new Error(
      `Cannot resolve a base URL for collection "${slug}": no "host" is configured. ` +
        `Add a "host" field to .deskwork/config.json if this collection is published as a website.`,
    );
  }
  return `https://${host}/`;
}

const DEFAULT_BLOG_FILENAME_TEMPLATE = '{slug}/index.md';

/**
 * Absolute path to the blog post markdown for a given slug.
 *
 * Resolution order (first match wins):
 *   1. Explicit `filePath` argument — joined with the site's `contentDir`.
 *      Used by the scaffolder when an explicit layout (`index` /
 *      `readme` / `flat`) was requested.
 *   2. The site's configured `blogFilenameTemplate` (default
 *      `{slug}/index.md`). Audiocontrol-shaped flat blogs hit this path.
 *
 * Slug-only API for callers that don't have an entry id available
 * (scaffold for not-yet-existent files, doctor's candidate search,
 * legacy publish/iterate paths). Callers that already hold a calendar
 * entry should prefer `findEntryFile` — it consults the content index
 * first, falling back to this template-driven path only when no
 * frontmatter binding exists yet.
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

// ---------------------------------------------------------------------------
// Phase 19c — id-based entry → file resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a calendar entry's file location via the content index.
 *
 * Refactor-proof: the binding is whatever file currently has matching
 * frontmatter `id:`. When the index has no record (entry's file hasn't
 * been bound yet — pre-doctor state) AND `legacyEntryForFallback` is
 * supplied, falls back to the site's `blogFilenameTemplate` to preserve
 * legacy behavior. Without that fallback hint, returns `undefined` so
 * callers can decide how to surface the missing binding.
 *
 * Note: the returned path is what the index says — its existence on
 * disk is implied (the index only records files it walked). The
 * template fallback path may NOT exist on disk; callers that need
 * existence guarantees should `existsSync` the result.
 *
 * @param projectRoot Absolute path to the deskwork project root.
 * @param config Loaded deskwork config.
 * @param site Site slug (or null/undefined for the default site).
 * @param entryId Calendar entry's stable UUID.
 * @param index Pre-built content index. When omitted, this function
 *              builds one. The studio passes a per-request memoized
 *              index; the CLI typically lets it build per call.
 * @param legacyEntryForFallback When supplied, allows the slug-template
 *              fallback for entries that haven't been bound to
 *              frontmatter yet. Pass `{slug}` to opt in.
 * @returns absolute path, or undefined if neither index nor template resolves.
 */
export function findEntryFile(
  projectRoot: string,
  config: DeskworkConfig,
  site: string | null | undefined,
  entryId: string,
  index?: ContentIndex,
  legacyEntryForFallback?: { slug: string },
): string | undefined {
  if (entryId !== '') {
    const idx = index ?? buildContentIndex(projectRoot, config, resolveSite(config, site));
    const hit = idx.byId.get(entryId);
    if (hit !== undefined) return hit;
  }
  if (legacyEntryForFallback !== undefined) {
    return resolveBlogFilePath(
      projectRoot,
      config,
      site,
      legacyEntryForFallback.slug,
    );
  }
  return undefined;
}

/**
 * Resolve the markdown file backing a calendar entry, preferring the
 * UUID frontmatter binding (refactor-proof) and falling back to the
 * site's slug-template only when no binding exists.
 *
 * Equivalent to the studio's `resolveLongformFilePath` but exposed as a
 * top-level helper from `paths.ts` so CLI commands can use it without
 * pulling in `review/` infrastructure. Always returns an absolute path
 * (the slug-template fallback is unconditional); callers should
 * `existsSync` if they need an existence guarantee.
 *
 * Precedence:
 *   1. Content index — when `entryId` is supplied (and non-empty), look
 *      up the file whose frontmatter `deskwork.id:` matches. Refactor-
 *      proof: the binding follows the file regardless of slug rename or
 *      directory relocation.
 *   2. Slug-template fallback — when the index has no record (entry's
 *      file isn't bound to frontmatter yet, e.g. pre-doctor / pre-ingest
 *      state) or no `entryId` was supplied, fall back to
 *      `resolveBlogFilePath(slug)`.
 *
 * @param projectRoot Absolute path to the deskwork project root.
 * @param config Loaded deskwork config.
 * @param site Site slug (or null/undefined for the default site).
 * @param slug Calendar entry slug — used both as the legacy fallback
 *             template input and as a hint for the slug-template fallback.
 * @param entryId Calendar entry's stable UUID. When omitted or empty,
 *                resolution falls straight through to the slug template.
 * @param index Pre-built content index. When omitted, this function
 *              builds one. Pass the per-request memoized index when
 *              calling from the studio; let the CLI build per call.
 */
export function resolveEntryFilePath(
  projectRoot: string,
  config: DeskworkConfig,
  site: string | null | undefined,
  slug: string,
  entryId?: string,
  index?: ContentIndex,
): string {
  if (entryId !== undefined && entryId !== '') {
    const idx = index ?? buildContentIndex(projectRoot, config, resolveSite(config, site));
    const hit = idx.byId.get(entryId);
    if (hit !== undefined) return hit;
  }
  return resolveBlogFilePath(projectRoot, config, site, slug);
}

// ---------------------------------------------------------------------------
// Phase 21a — shortform file resolution
// ---------------------------------------------------------------------------

/**
 * Channel must be a kebab-case token. Same shape as a slug segment so the
 * filename remains URL-safe and matches the rest of deskwork's vocabulary.
 */
const CHANNEL_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Resolve the markdown file path for a shortform draft.
 *
 *   <contentDir>/<entry-dir>/scrapbook/shortform/<platform>[-<channel>].md
 *
 * Platform is the lowercase Platform value. Channel (if present) is appended
 * as `-<channel>`. Channel must validate against the kebab-case regex —
 * deskwork stores channels as kebab-case strings throughout.
 *
 * The entry directory is resolved through `findEntryFile` (id-driven,
 * refactor-proof) with slug-template fallback for legacy entries created
 * pre-doctor. The slug-template fallback is intentional migration logic so
 * pre-bind entries keep working.
 *
 * Forward-compatibility: every reference to the shortform file location
 * goes through this function. Phase 20 (sandbox migration) redirects this
 * single function; everything downstream (handlers, CLI, studio) works
 * unchanged.
 *
 * @param projectRoot Absolute path to the deskwork project root.
 * @param config Loaded deskwork config.
 * @param site Site slug (or null/undefined for the default site).
 * @param entry Calendar entry — `id` preferred, `slug` used both as the
 *              legacy fallback and to identify the entry directory.
 * @param platform Which distribution platform.
 * @param channel Optional sub-channel (e.g. `synthdiy` for r/synthdiy).
 *                Must be kebab-case.
 * @param index Optional pre-built content index (per-request memoization).
 * @returns absolute file path, or undefined when neither the index nor the
 *          slug-template fallback resolves the entry's directory.
 */
export function resolveShortformFilePath(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  entry: { id?: string; slug: string },
  platform: Platform,
  channel?: string,
  index?: ContentIndex,
): string | undefined {
  if (channel !== undefined && channel !== '') {
    if (!CHANNEL_RE.test(channel)) {
      throw new Error(
        `Invalid shortform channel "${channel}": must match ${CHANNEL_RE} ` +
          `(kebab-case, same shape as a slug segment).`,
      );
    }
  }

  const entryFile = findEntryFile(
    projectRoot,
    config,
    site,
    entry.id ?? '',
    index,
    { slug: entry.slug },
  );
  if (entryFile === undefined) return undefined;

  const entryDir = dirname(entryFile);
  const filename =
    channel !== undefined && channel !== ''
      ? `${platform}-${channel}.md`
      : `${platform}.md`;
  return join(entryDir, 'scrapbook', 'shortform', filename);
}
