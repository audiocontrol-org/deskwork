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
