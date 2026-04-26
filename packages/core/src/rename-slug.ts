/**
 * Slug rename for blog entries.
 *
 * Renames the per-post directory at `<contentDir>/<slug>/` to its new
 * name, updates the calendar entry's slug, syncs slug on matching
 * distribution records, and (optionally) appends a 301 redirect block
 * to the site's `_redirects` file. UUID identity keeps workflows,
 * distribution records, and journal history joined through `entry.id`
 * across the rename.
 *
 * Assumes the dir-based layout: blog posts live as
 * `<contentDir>/<slug>/index.md` (or `<slug>/<file>.md` per
 * `blogFilenameTemplate`) with assets co-located in the same dir. For
 * flat-file layouts (`{slug}.md`) the directory itself doesn't exist —
 * skip the dir-rename step but still update the calendar.
 */

import { existsSync, renameSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DeskworkConfig } from './config.ts';
import { resolveBlogPostDir, resolveCalendarPath } from './paths.ts';
import { readCalendar, writeCalendar } from './calendar.ts';
import { effectiveContentType } from './types.ts';

export interface RenameSlugOptions {
  projectRoot: string;
  config: DeskworkConfig;
  site: string;
  oldSlug: string;
  newSlug: string;
  dryRun?: boolean;
}

export interface RenameSlugPlanAction {
  kind:
    | 'dir-rename'
    | 'calendar-slug-change'
    | 'distribution-slug-sync'
    | 'redirect-append';
  summary: string;
  details?: string;
}

export interface RenameSlugResult {
  entryId: string;
  oldSlug: string;
  newSlug: string;
  actions: RenameSlugPlanAction[];
  dryRun: boolean;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`invalid slug "${slug}" — must match ${SLUG_RE}`);
  }
}

/**
 * Build the 301 redirect block for a slug rename. Only covers the page
 * URL; per-post images served as hashed `/_astro/` URLs don't embed the
 * slug, so no image-path redirect is needed.
 */
export function buildRedirectBlock(oldSlug: string, newSlug: string): string {
  return [
    '',
    `# Slug rename: /blog/${oldSlug}/ → /blog/${newSlug}/`,
    `/blog/${oldSlug}        /blog/${newSlug}/          301`,
    `/blog/${oldSlug}/       /blog/${newSlug}/          301`,
    `/blog/${oldSlug}/*      /blog/${newSlug}/:splat    301`,
    '',
  ].join('\n');
}

function siteEntry(config: DeskworkConfig, site: string) {
  if (!(site in config.sites)) {
    const known = Object.keys(config.sites).join(', ');
    throw new Error(`unknown site "${site}". Configured sites: ${known}`);
  }
  return config.sites[site];
}

/**
 * Execute (or dry-run) a slug rename.
 */
export function renameSlug(options: RenameSlugOptions): RenameSlugResult {
  const { projectRoot, config, site, oldSlug, newSlug, dryRun = false } = options;
  validateSlug(oldSlug);
  validateSlug(newSlug);
  if (oldSlug === newSlug) {
    throw new Error('oldSlug and newSlug are identical — nothing to do');
  }

  const siteCfg = siteEntry(config, site);
  const calendarPath = resolveCalendarPath(projectRoot, config, site);
  const calendar = readCalendar(calendarPath);
  const entry = calendar.entries.find((e) => e.slug === oldSlug);
  if (!entry) {
    throw new Error(
      `no calendar entry with slug "${oldSlug}" on site "${site}"`,
    );
  }
  if (!entry.id) {
    throw new Error(
      `entry "${oldSlug}" has no UUID — re-save the calendar to backfill`,
    );
  }

  const collision = calendar.entries.find(
    (e) => e.slug === newSlug && e.id !== entry.id,
  );
  if (collision) {
    throw new Error(
      `slug "${newSlug}" is already taken by entry ${collision.id ?? '(no id)'} (${collision.title})`,
    );
  }

  const actions: RenameSlugPlanAction[] = [];
  const oldDir = resolveBlogPostDir(projectRoot, config, site, oldSlug);
  const newDir = resolveBlogPostDir(projectRoot, config, site, newSlug);

  // 1. Directory rename. Under the dir-based layout blog posts live as
  //    `<contentDir>/<slug>/` with assets co-located, so a single mv
  //    carries the markdown + co-located assets in one atomic
  //    operation. For blog entries the directory must exist when the
  //    layout is dir-based — if it's missing the calendar row has
  //    drifted from disk and the operator needs to reconcile before
  //    rename can proceed. Flat-file layouts (e.g.
  //    `blogFilenameTemplate: "{slug}.md"`) don't have a per-post
  //    directory; the rename is then calendar-only.
  const isDirLayout = !siteCfg.blogFilenameTemplate || siteCfg.blogFilenameTemplate.includes('/');
  const dirExists = existsSync(oldDir);
  if (isDirLayout && !dirExists && effectiveContentType(entry) === 'blog') {
    throw new Error(
      `calendar entry "${oldSlug}" is a blog post but no directory exists at ${oldDir}. ` +
        `The calendar row has drifted from disk — reconcile the row's slug to match the actual ` +
        `directory name, then re-run the rename against the real slug.`,
    );
  }
  if (dirExists) {
    if (existsSync(newDir)) {
      throw new Error(`target directory already exists: ${newDir}`);
    }
    actions.push({
      kind: 'dir-rename',
      summary: 'rename post directory',
      details: `${oldDir}\n         → ${newDir}`,
    });
    if (!dryRun) renameSync(oldDir, newDir);
  }

  // 2. Calendar entry slug change
  actions.push({
    kind: 'calendar-slug-change',
    summary: `calendar entry.slug: "${oldSlug}" → "${newSlug}"`,
    details: `entry.id ${entry.id} unchanged — all workflow/distribution joins preserved`,
  });
  if (!dryRun) {
    entry.slug = newSlug;
  }

  // 3. Cosmetic slug sync on distributions with the same entryId
  const matchingDistributions = calendar.distributions.filter(
    (d) => d.entryId === entry.id,
  );
  if (matchingDistributions.length > 0) {
    actions.push({
      kind: 'distribution-slug-sync',
      summary: `sync slug on ${matchingDistributions.length} distribution record(s)`,
      details: matchingDistributions
        .map((d) => `  ${d.platform}${d.channel ? `/${d.channel}` : ''} → slug "${newSlug}"`)
        .join('\n'),
    });
    if (!dryRun) {
      for (const d of matchingDistributions) d.slug = newSlug;
    }
  }

  if (!dryRun) {
    writeCalendar(calendarPath, calendar);
  }

  // 4. _redirects append (when site has redirectsPath configured)
  if (siteCfg.redirectsPath) {
    const redirectsFile = join(projectRoot, siteCfg.redirectsPath);
    const block = buildRedirectBlock(oldSlug, newSlug);
    actions.push({
      kind: 'redirect-append',
      summary: `append 301 redirect block to _redirects`,
      details: `  file: ${redirectsFile}\n${block
        .split('\n')
        .map((l) => `         ${l}`)
        .join('\n')}`,
    });
    if (!dryRun) {
      if (!existsSync(redirectsFile)) {
        writeFileSync(redirectsFile, block, 'utf-8');
      } else {
        appendFileSync(redirectsFile, block, 'utf-8');
      }
    }
  }

  return {
    entryId: entry.id,
    oldSlug,
    newSlug,
    actions,
    dryRun,
  };
}
