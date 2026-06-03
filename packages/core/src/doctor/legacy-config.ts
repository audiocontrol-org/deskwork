/**
 * Migration-only tolerant reader for the legacy `config.sites` block
 * (Phase 39b; finalized in 39c as the sole home for `SiteConfig`).
 *
 * Per the sites→lanes retirement spec §"Migration":
 *
 *   > `sites` reads are tolerated *only* inside this migration. After it
 *   > runs, nothing reads `sites`.
 *
 * This module is that tolerated read surface. It parses the on-disk
 * `.deskwork/config.json` directly and extracts just the fields the
 * migration needs (`sites.<id>.{contentDir, calendarPath, host}`),
 * WITHOUT going through `parseConfig` — `parseConfig` REQUIRES a
 * non-empty `sites` block, so it would throw on a post-migration config
 * (the one the migration itself wrote when it dropped `sites`). The
 * migration must read both shapes:
 *
 *   - pre-migration  (`sites` present)  → returns the legacy sites map.
 *   - post-migration (`sites` absent)   → returns an EMPTY map, the
 *     "nothing to migrate" signal the rule's idempotency relies on.
 *
 * 39b keeps the field present in the live schema; this reader exists so
 * the migration does not depend on the live schema's required-`sites`
 * invariant. 39c moves `SiteConfig` here and removes the live-schema
 * `sites` field; until then this is a focused, additive read helper.
 *
 * Sibling-relative imports per the doctor convention (`@/` does not
 * resolve under tsx at runtime in this package's `src/`).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { configPath } from '../config.ts';

/**
 * The legacy per-site fields the migration consumes. A subset of the
 * full `SiteConfig` — only what lanes-from-sites + the host re-home
 * need. Other legacy fields (`blogLayout`, `redirectsPath`, …) are not
 * read by the migration and are intentionally not surfaced here.
 */
export interface LegacySite {
  /** Content directory, relative to the project root (or absolute). */
  readonly contentDir: string;
  /** Editorial calendar markdown path (vestigial under Phase 30). */
  readonly calendarPath?: string;
  /** Bare public hostname — re-homed onto the lane's `host`. */
  readonly host?: string;
}

/** A legacy site keyed by its slug (the lane id the migration creates). */
export interface LegacySites {
  readonly sites: ReadonlyMap<string, LegacySite>;
}

/** Narrow an unknown to a string-keyed record (object, not null/array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Read a non-empty string property from a record (undefined otherwise). */
function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Read the legacy `sites` block from `<projectRoot>/.deskwork/config.json`
 * tolerantly.
 *
 *   - Config file ABSENT (ENOENT — never installed, or a bare fixture) →
 *     returns an empty map. A project with no config has no legacy sites
 *     to migrate; the rule no-ops. This mirrors `bootstrap.ts`'s
 *     "no-config → nothing to do" branch and keeps the migration rule
 *     safe to run unconditionally across the doctor's per-site loop.
 *   - Config PRESENT but unreadable (non-ENOENT I/O) / not valid JSON →
 *     throws. A config that exists but is broken should surface loudly
 *     where the operator can fix it (AUDIT-20260530-10 precedent;
 *     silently treating it as "no sites" would mask a real config-side
 *     problem — the project's "no fallbacks" rule).
 *   - Config present but no `sites` block (the post-migration shape) →
 *     returns an empty map. This is the idempotency signal: nothing to
 *     migrate.
 *   - `sites` present → returns each site's `{ contentDir, calendarPath,
 *     host }`. A site missing a non-empty `contentDir` throws (the
 *     migration cannot derive `scaffoldDefaults` without it).
 *
 * @throws when a PRESENT config is unreadable / not JSON, or a declared
 *   site lacks a non-empty `contentDir`.
 */
export function readLegacySites(projectRoot: string): LegacySites {
  const path = configPath(projectRoot);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      // No config on disk — no legacy sites. Nothing to migrate.
      return { sites: new Map<string, LegacySite>() };
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `sites-to-lanes migration: could not read ${path}: ${reason}. ` +
        `The migration needs the config to read the legacy "sites" block.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `sites-to-lanes migration: invalid JSON in ${path}: ${reason}.`,
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      `sites-to-lanes migration: ${path} is not a JSON object.`,
    );
  }
  const obj = parsed;

  const sites = new Map<string, LegacySite>();
  const sitesValue = obj.sites;
  if (!isRecord(sitesValue)) {
    // No `sites` block (post-migration shape) — nothing to migrate.
    return { sites };
  }

  for (const slug of Object.keys(sitesValue)) {
    const siteObj = sitesValue[slug];
    if (!isRecord(siteObj)) {
      throw new Error(
        `sites-to-lanes migration: site "${slug}" in ${path} is not an object.`,
      );
    }
    const contentDir = readString(siteObj, 'contentDir');
    if (contentDir === undefined) {
      throw new Error(
        `sites-to-lanes migration: site "${slug}" in ${path} is missing a ` +
          `non-empty "contentDir"; the migration cannot derive scaffoldDefaults ` +
          `without it. Repair the config and re-run.`,
      );
    }
    const calendarPath = readString(siteObj, 'calendarPath');
    const host = readString(siteObj, 'host');
    const site: LegacySite = {
      contentDir,
      ...(calendarPath !== undefined ? { calendarPath } : {}),
      ...(host !== undefined ? { host } : {}),
    };
    sites.set(slug, site);
  }

  return { sites };
}

/**
 * Rewrite `<projectRoot>/.deskwork/config.json` with the `sites` and
 * `defaultSite` keys removed (migration step 3 — "drop sites"). Every
 * other top-level key is preserved verbatim. A no-op when neither key
 * is present (idempotent).
 *
 * Returns `true` when the file was rewritten (a key was dropped),
 * `false` when there was nothing to drop.
 *
 * Note: the resulting config no longer satisfies `parseConfig` (which
 * still requires `sites` in 39b). That is the expected pre-1.0
 * decisive-cutover state per the spec — 39c relaxes `parseConfig` to
 * the shrunken shape. Until then, post-migration config reads go
 * through `readLegacySites` (this module), not `readConfig`.
 */
export function dropSitesBlock(projectRoot: string): boolean {
  const path = configPath(projectRoot);
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error(
      `sites-to-lanes migration: ${path} is not a JSON object; cannot drop sites.`,
    );
  }
  const obj = parsed;
  const hadSites = Object.prototype.hasOwnProperty.call(obj, 'sites');
  const hadDefault = Object.prototype.hasOwnProperty.call(obj, 'defaultSite');
  if (!hadSites && !hadDefault) {
    return false;
  }
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (key === 'sites' || key === 'defaultSite') continue;
    next[key] = obj[key];
  }
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return true;
}
