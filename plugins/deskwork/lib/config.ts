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
  /** Bare public hostname, no protocol (e.g. `audiocontrol.org`) */
  host: string;
  /** Blog content directory, relative to the project root */
  contentDir: string;
  /** Editorial calendar markdown file, relative to the project root */
  calendarPath: string;
  /** Optional cross-posting channels JSON file, relative to the project root */
  channelsPath?: string;
}

/** Top-level deskwork config. */
export interface DeskworkConfig {
  version: typeof CONFIG_VERSION;
  /** Sites keyed by slug (matches the directory segment under `src/sites/<slug>/`). */
  sites: Record<string, SiteConfig>;
  /** Which site to target when no `--site` argument is passed. */
  defaultSite: string;
}

const ALLOWED_TOP_LEVEL_KEYS = new Set(['version', 'sites', 'defaultSite']);
const REQUIRED_SITE_KEYS = ['host', 'contentDir', 'calendarPath'] as const;
const ALLOWED_SITE_KEYS = new Set([...REQUIRED_SITE_KEYS, 'channelsPath']);

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

  return { version: CONFIG_VERSION, sites, defaultSite };
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
    host: obj.host as string,
    contentDir: obj.contentDir as string,
    calendarPath: obj.calendarPath as string,
  };

  if (obj.channelsPath !== undefined) {
    if (typeof obj.channelsPath !== 'string' || obj.channelsPath.length === 0) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid "channelsPath" ` +
          `(must be a non-empty string when set).`,
      );
    }
    site.channelsPath = obj.channelsPath;
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
