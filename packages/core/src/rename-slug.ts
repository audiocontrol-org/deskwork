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
import { resolveCalendarPath } from './paths.ts';
import { readCalendar, writeCalendar } from './calendar.ts';
import { readSidecarSync } from './sidecar/read.ts';
import { writeSidecarSync } from './sidecar/write.ts';
import { sidecarPath } from './sidecar/paths.ts';

/**
 * Detect a slug rename's filesystem shape from the entry's stored
 * (POSIX, relative) `artifactPath` (Phase 39c-2b(a), spec AUDIT-36).
 *
 *   - `…/<slug>/index.md`  → move the per-post DIR `<base>/<slug>`
 *   - `…/<slug>/README.md` → move the per-post DIR `<base>/<slug>`
 *   - `…/<slug>.<ext>`     → move the FILE
 *
 * Returns the relative move source + target (dir or file) plus the new
 * relative artifactPath. No naive slug-substring replacement — only the
 * slug segment changes, never a same-named ancestor directory.
 */
function planArtifactMove(
  artifactPath: string,
  newSlug: string,
): { fromRel: string; toRel: string; newArtifactRel: string } {
  const segments = artifactPath.split('/');
  const filename = segments[segments.length - 1];
  const isDirLayout = filename === 'index.md' || filename === 'README.md';
  if (isDirLayout) {
    // <base>/<slug>/<filename> → move the <slug> dir.
    const slugDirRel = segments.slice(0, -1).join('/'); // <base>/<slug>
    const baseRel = segments.slice(0, -2).join('/'); // <base>
    const toDirRel = baseRel === '' ? newSlug : `${baseRel}/${newSlug}`;
    return {
      fromRel: slugDirRel,
      toRel: toDirRel,
      newArtifactRel: `${toDirRel}/${filename}`,
    };
  }
  // Flat: <base>/<slug>.<ext> → move the file.
  const ext = filename.slice(filename.lastIndexOf('.'));
  const baseRel = segments.slice(0, -1).join('/');
  const toFileRel =
    baseRel === '' ? `${newSlug}${ext}` : `${baseRel}/${newSlug}${ext}`;
  return { fromRel: artifactPath, toRel: toFileRel, newArtifactRel: toFileRel };
}

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

const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

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

  // 1. Move the artifact. Phase 39c-2b(a) / spec AUDIT-36: the move is
  //    derived from the entry's STORED artifactPath (layout-detected) —
  //    not a slug-template dir. For an index/README layout the per-post
  //    DIR moves (carrying co-located assets in one mv); for a flat
  //    layout the FILE moves. The sidecar's artifactPath is rewritten to
  //    the new location. No naive slug-substring replacement.
  // AUDIT-20260604-02: an entry with a calendar row but no sidecar file is
  // a drift case like any other — surface the actionable doctor --fix
  // guidance, not the raw `sidecar not found` ENOENT from readSidecarSync.
  // AUDIT-20260604-05: distinguish a MISSING sidecar (file absent) from a
  // CORRUPT one (file present but invalid JSON/schema). A bare catch would
  // misreport corruption as "no sidecar on disk" and send the operator to
  // the wrong remedy — re-throw readSidecarSync's accurate diagnosis when
  // the file actually exists.
  let sidecar;
  try {
    sidecar = readSidecarSync(projectRoot, entry.id);
  } catch (err) {
    if (existsSync(sidecarPath(projectRoot, entry.id))) {
      throw err;
    }
    throw new Error(
      `entry "${oldSlug}" (${entry.id}) has a calendar row but no sidecar on ` +
        `disk — run \`deskwork doctor --fix\` to reconcile before renaming.`,
    );
  }
  if (sidecar.artifactPath === undefined) {
    throw new Error(
      `entry "${oldSlug}" (${entry.id}) has no artifactPath — run ` +
        `\`deskwork doctor --fix\` to backfill it before renaming.`,
    );
  }
  const move = planArtifactMove(sidecar.artifactPath, newSlug);
  const fromAbs = join(projectRoot, move.fromRel);
  const toAbs = join(projectRoot, move.toRel);
  if (!existsSync(fromAbs)) {
    throw new Error(
      `entry "${oldSlug}" artifactPath ${sidecar.artifactPath} does not exist on disk at ` +
        `${fromAbs}. The calendar/sidecar has drifted from disk — reconcile before renaming.`,
    );
  }
  if (existsSync(toAbs)) {
    throw new Error(`target already exists: ${toAbs}`);
  }
  actions.push({
    kind: 'dir-rename',
    summary: 'move post artifact',
    details: `${fromAbs}\n         → ${toAbs}`,
  });
  if (!dryRun) {
    renameSync(fromAbs, toAbs);
    writeSidecarSync(projectRoot, {
      ...sidecar,
      artifactPath: move.newArtifactRel,
    });
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
