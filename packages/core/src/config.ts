/**
 * deskwork plugin configuration.
 *
 * A host project is "installed" by writing a `.deskwork/config.json` at the
 * project root. The config tells the plugin where content lives, where to
 * keep the editorial calendar, and which sites the project hosts.
 *
 * The schema is intentionally minimal — one version, one set of required
 * fields per site, no hidden defaults. `parseConfig` validates an unknown
 * JSON value and returns a typed DeskworkConfig or throws an Error whose
 * message tells the user which field is wrong.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Current config schema version. Bumped only with a migration path. */
export const CONFIG_VERSION = 1;

/** A single site the host project publishes to. */
export interface SiteConfig {
  /**
   * Bare public hostname, no protocol (e.g. `audiocontrol.org`). Optional —
   * required only when the collection is rendered as a website. Internal-doc
   * collections, books, or tool monorepos that use deskwork purely for
   * content-lifecycle management omit this field.
   */
  host?: string;
  /** Blog content directory, relative to the project root */
  contentDir: string;
  /** Editorial calendar markdown file, relative to the project root */
  calendarPath: string;
  /** Optional cross-posting channels JSON file, relative to the project root */
  channelsPath?: string;
  /**
   * Value to set on new blog posts' `layout:` frontmatter field. Typically a
   * relative path like `../../layouts/BlogLayout.astro`. Only emitted when
   * set — projects using Astro content collections usually leave this unset
   * (layout resolution happens in the collection config instead).
   */
  blogLayout?: string;
  /**
   * Path template for scaffolded blog files, relative to `contentDir`. Uses
   * `{slug}` as the placeholder. Defaults to `"{slug}/index.md"` (directory-
   * style). Astro content collections typically use `"{slug}.md"` (flat).
   */
  blogFilenameTemplate?: string;
  /**
   * Value to set on the scaffolded post's `state:` frontmatter field. When
   * set, the line `state: <value>` is emitted. Typical value: `"draft"`.
   * Host projects that gate prod builds on `state !== "draft"` use this to
   * keep in-flight posts out of production.
   */
  blogInitialState?: string;
  /**
   * If true, the scaffolder inserts a `## Outline` section (with a placeholder
   * comment) between the H1 and the body placeholder. Default false.
   */
  blogOutlineSection?: boolean;
  /**
   * Path to the site's `_redirects` file (Netlify-style), relative to
   * the project root. The slug-rename helper appends 301 redirects here
   * when an existing post is renamed. Optional — when unset, slug-rename
   * skips the redirect-append step.
   */
  redirectsPath?: string;
}

/** Top-level deskwork config. */
export interface DeskworkConfig {
  version: typeof CONFIG_VERSION;
  /** Sites keyed by slug (matches the directory segment under `src/sites/<slug>/`). */
  sites: Record<string, SiteConfig>;
  /** Which site to target when no `--site` argument is passed. */
  defaultSite: string;
  /** Author name for new blog posts' `author:` frontmatter field (optional). */
  author?: string;
  /**
   * Review journal directory relative to the project root. Defaults to
   * `.deskwork/review-journal`. Host projects migrating from a prior layout
   * can point this at an existing directory (e.g. `journal/editorial`).
   */
  reviewJournalDir?: string;
}

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'version',
  'sites',
  'defaultSite',
  'author',
  'reviewJournalDir',
]);
const REQUIRED_SITE_KEYS = ['contentDir', 'calendarPath'] as const;
const ALLOWED_SITE_KEYS = new Set<string>([
  ...REQUIRED_SITE_KEYS,
  'host',
  'channelsPath',
  'blogLayout',
  'blogFilenameTemplate',
  'blogInitialState',
  'blogOutlineSection',
  'redirectsPath',
]);

/** Return the absolute path to `.deskwork/config.json` under a project root. */
export function configPath(projectRoot: string): string {
  return join(projectRoot, '.deskwork', 'config.json');
}

/**
 * Validate and normalize an unknown value as a DeskworkConfig.
 *
 * Throws an Error with a specific message when the value doesn't match the
 * schema. On success, returns a fresh typed object — callers can mutate it
 * without worrying about shared references.
 */
export function parseConfig(value: unknown): DeskworkConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `Invalid deskwork config: expected a JSON object, got ${describe(value)}.`,
    );
  }
  const obj = value as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      throw new Error(
        `Invalid deskwork config: unknown key "${key}". ` +
          `Allowed keys: ${[...ALLOWED_TOP_LEVEL_KEYS].join(', ')}.`,
      );
    }
  }

  if (obj.version !== CONFIG_VERSION) {
    throw new Error(
      `Invalid deskwork config: expected version ${CONFIG_VERSION}, got ${JSON.stringify(
        obj.version,
      )}. Run /deskwork:install to regenerate the config.`,
    );
  }

  const sitesValue = obj.sites;
  if (
    sitesValue === undefined ||
    sitesValue === null ||
    typeof sitesValue !== 'object' ||
    Array.isArray(sitesValue)
  ) {
    throw new Error(
      `Invalid deskwork config: "sites" must be an object keyed by site slug.`,
    );
  }

  const siteSlugs = Object.keys(sitesValue);
  if (siteSlugs.length === 0) {
    throw new Error(
      `Invalid deskwork config: at least one site must be defined under "sites".`,
    );
  }

  const sites: Record<string, SiteConfig> = {};
  for (const slug of siteSlugs) {
    sites[slug] = parseSiteConfig(slug, (sitesValue as Record<string, unknown>)[slug]);
  }

  const defaultSite = resolveDefaultSite(obj.defaultSite, siteSlugs);

  const config: DeskworkConfig = { version: CONFIG_VERSION, sites, defaultSite };
  if (obj.author !== undefined) {
    if (typeof obj.author !== 'string' || obj.author.length === 0) {
      throw new Error(
        `Invalid deskwork config: "author" must be a non-empty string when set.`,
      );
    }
    config.author = obj.author;
  }
  if (obj.reviewJournalDir !== undefined) {
    if (
      typeof obj.reviewJournalDir !== 'string' ||
      obj.reviewJournalDir.length === 0
    ) {
      throw new Error(
        `Invalid deskwork config: "reviewJournalDir" must be a non-empty string when set.`,
      );
    }
    config.reviewJournalDir = obj.reviewJournalDir;
  }
  return config;
}

function parseSiteConfig(slug: string, value: unknown): SiteConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `Invalid deskwork config: site "${slug}" must be an object, got ${describe(
        value,
      )}.`,
    );
  }
  const obj = value as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_SITE_KEYS.has(key)) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has unknown key "${key}". ` +
          `Allowed keys: ${[...ALLOWED_SITE_KEYS].join(', ')}.`,
      );
    }
  }

  for (const key of REQUIRED_SITE_KEYS) {
    const v = obj[key];
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" is missing required field "${key}" ` +
          `(must be a non-empty string).`,
      );
    }
  }

  const site: SiteConfig = {
    contentDir: obj.contentDir as string,
    calendarPath: obj.calendarPath as string,
  };

  if (obj.host !== undefined) {
    if (typeof obj.host !== 'string' || obj.host.length === 0) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid "host" ` +
          `(must be a non-empty string when set).`,
      );
    }
    site.host = obj.host;
  }

  if (obj.channelsPath !== undefined) {
    if (typeof obj.channelsPath !== 'string' || obj.channelsPath.length === 0) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid "channelsPath" ` +
          `(must be a non-empty string when set).`,
      );
    }
    site.channelsPath = obj.channelsPath;
  }

  if (obj.blogLayout !== undefined) {
    if (typeof obj.blogLayout !== 'string' || obj.blogLayout.length === 0) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid "blogLayout" ` +
          `(must be a non-empty string when set).`,
      );
    }
    site.blogLayout = obj.blogLayout;
  }

  if (obj.blogFilenameTemplate !== undefined) {
    if (
      typeof obj.blogFilenameTemplate !== 'string' ||
      obj.blogFilenameTemplate.length === 0
    ) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid ` +
          `"blogFilenameTemplate" (must be a non-empty string when set).`,
      );
    }
    if (!obj.blogFilenameTemplate.includes('{slug}')) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" blogFilenameTemplate ` +
          `"${obj.blogFilenameTemplate}" must contain the "{slug}" placeholder.`,
      );
    }
    site.blogFilenameTemplate = obj.blogFilenameTemplate;
  }

  if (obj.blogInitialState !== undefined) {
    if (
      typeof obj.blogInitialState !== 'string' ||
      obj.blogInitialState.length === 0
    ) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid ` +
          `"blogInitialState" (must be a non-empty string when set).`,
      );
    }
    site.blogInitialState = obj.blogInitialState;
  }

  if (obj.blogOutlineSection !== undefined) {
    if (typeof obj.blogOutlineSection !== 'boolean') {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid ` +
          `"blogOutlineSection" (must be a boolean when set).`,
      );
    }
    site.blogOutlineSection = obj.blogOutlineSection;
  }

  if (obj.redirectsPath !== undefined) {
    if (typeof obj.redirectsPath !== 'string' || obj.redirectsPath.length === 0) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid "redirectsPath" ` +
          `(must be a non-empty string when set).`,
      );
    }
    site.redirectsPath = obj.redirectsPath;
  }

  return site;
}

function resolveDefaultSite(value: unknown, siteSlugs: string[]): string {
  if (value === undefined || value === null) {
    if (siteSlugs.length === 1) return siteSlugs[0];
    throw new Error(
      `Invalid deskwork config: "defaultSite" is required when more than one site is defined. ` +
        `Configured sites: ${siteSlugs.join(', ')}.`,
    );
  }
  if (typeof value !== 'string') {
    throw new Error(
      `Invalid deskwork config: "defaultSite" must be a string, got ${describe(value)}.`,
    );
  }
  if (!siteSlugs.includes(value)) {
    throw new Error(
      `Invalid deskwork config: defaultSite "${value}" is not a configured site. ` +
        `Valid sites: ${siteSlugs.join(', ')}.`,
    );
  }
  return value;
}

/**
 * Resolve a site's contentDir. Returns the absolute path to the site's
 * content directory. Used by helpers that need to find on-disk artifacts
 * without hardcoding `docs/` (the legacy default — see #140 carryover
 * notes).
 */
export function getContentDir(projectRoot: string, site?: string): string {
  const cfg = readConfig(projectRoot);
  const siteName = site ?? cfg.defaultSite;
  const siteCfg = cfg.sites[siteName];
  if (!siteCfg) {
    throw new Error(
      `Unknown site "${siteName}" in .deskwork/config.json. ` +
        `Configured sites: ${Object.keys(cfg.sites).join(', ')}.`,
    );
  }
  return join(projectRoot, siteCfg.contentDir);
}

/** Read and parse the deskwork config for a project root. */
export function readConfig(projectRoot: string): DeskworkConfig {
  const path = configPath(projectRoot);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not read .deskwork/config.json at ${path}: ${reason}. ` +
        `Run /deskwork:install to create one.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${path}: ${reason}`);
  }
  return parseConfig(parsed);
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
