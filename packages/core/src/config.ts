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
import { type SiteConfig, parseSiteConfig } from './config-site.ts';

export { type SiteConfig } from './config-site.ts';

/** Current config schema version. Bumped only with a migration path. */
export const CONFIG_VERSION = 1;

/**
 * Studio-bridge feature configuration. When `enabled: true`, the studio
 * exposes a loopback-only MCP endpoint and chat panel; the SessionStart
 * hook auto-engages /deskwork:listen so the operator can dispatch from
 * a phone or iPad over Tailscale. Default: feature is OFF unless
 * explicitly enabled.
 */
export interface StudioBridgeConfig {
  enabled?: boolean;
  /**
   * Idle timeout (seconds) for each await_studio_message poll inside
   * the listen loop. Tunes how often the loop reports back to the
   * agent before resuming the await. Defaults to 600 (10 minutes).
   */
  idleTimeout?: number;
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
  /** Studio bridge (MCP listen-loop) configuration. Off by default. */
  studioBridge?: StudioBridgeConfig;
}

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'version',
  'sites',
  'defaultSite',
  'author',
  'reviewJournalDir',
  'studioBridge',
]);
const ALLOWED_STUDIO_BRIDGE_KEYS = new Set(['enabled', 'idleTimeout']);

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
  if (obj.studioBridge !== undefined) {
    config.studioBridge = parseStudioBridgeConfig(obj.studioBridge);
  }
  return config;
}

function parseStudioBridgeConfig(value: unknown): StudioBridgeConfig {
  if (!isObjectLike(value)) {
    throw new Error(
      `Invalid deskwork config: "studioBridge" must be an object if set, got ${describe(
        value,
      )}.`,
    );
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_STUDIO_BRIDGE_KEYS.has(key)) {
      throw new Error(
        `Invalid deskwork config: studioBridge has unknown field "${key}". ` +
          `Allowed fields: ${[...ALLOWED_STUDIO_BRIDGE_KEYS].join(', ')}.`,
      );
    }
  }

  const out: StudioBridgeConfig = {};

  if (value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') {
      throw new Error(
        `Invalid deskwork config: studioBridge.enabled must be a boolean when set, got ${describe(
          value.enabled,
        )}.`,
      );
    }
    out.enabled = value.enabled;
  }

  if (value.idleTimeout !== undefined) {
    const t = value.idleTimeout;
    if (typeof t !== 'number' || !Number.isFinite(t) || !Number.isInteger(t) || t < 1) {
      throw new Error(
        `Invalid deskwork config: studioBridge.idleTimeout must be a positive integer ` +
          `(>= 1) when set, got ${JSON.stringify(t)}.`,
      );
    }
    out.idleTimeout = t;
  }

  return out;
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
