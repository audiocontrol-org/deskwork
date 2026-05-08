/**
 * Scrapbook listing + counting helpers.
 *
 * Read-only inventory of a scrapbook directory: sorted item lists +
 * total counts, with a public/secret split.
 *
 * Three addressing modes — slug-template (`listScrapbook` /
 * `countScrapbook`), pre-resolved dir (`listScrapbookAtDir`), and
 * entry-aware (`listScrapbookForEntry` / `countScrapbookForEntry`).
 * The slug-template variants stay public because read-side callers
 * (the studio scrapbook viewer page, the dashboard chip count) operate
 * on a path key that's structurally a slug; the legacy entry point is
 * still useful at that boundary. The mutation side (#192) collapsed
 * to entry-aware only.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DeskworkConfig } from '../config.ts';
import type { ContentIndex } from '../content-index.ts';
import { _scrapbookDirSlug, scrapbookDirForEntry } from './paths.ts';
import { classify } from './validation.ts';
import {
  SECRET_SUBDIR,
  type ScrapbookItem,
  type ScrapbookSummary,
} from './types.ts';

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

/**
 * List the items in a scrapbook, sorted newest-mtime first. Returns
 * both public items (top-level files) and secret items (files inside
 * `scrapbook/secret/`). Subdirectories at the top level OTHER than
 * `secret/` are ignored — deskwork doesn't recurse into arbitrary
 * trees inside a scrapbook.
 */
export function listScrapbook(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
): ScrapbookSummary {
  const dir = _scrapbookDirSlug(projectRoot, config, site, slug);
  return listScrapbookAtDir(site, slug, dir);
}

/**
 * List a scrapbook by absolute directory path. Used by callers that
 * have already resolved the on-disk path via `scrapbookDirForEntry`
 * (id-driven) or `scrapbookDirAtPath` (fs-path-driven) and don't want
 * to re-derive through the slug template. The `slug` parameter is only
 * used to populate the returned summary's identifier field — it does
 * not influence path resolution.
 *
 * Internal primitive shared by `listScrapbook` (slug-based) and
 * `listScrapbookForEntry` (id-driven).
 */
export function listScrapbookAtDir(
  site: string,
  slug: string,
  dir: string,
): ScrapbookSummary {
  if (!existsSync(dir)) {
    return { site, slug, dir, exists: false, items: [], secretItems: [] };
  }
  const items = listFilesInDir(dir);
  const secretDir = join(dir, SECRET_SUBDIR);
  const secretItems = existsSync(secretDir) ? listFilesInDir(secretDir) : [];
  return { site, slug, dir, exists: true, items, secretItems };
}

/**
 * List scrapbook items for a tracked calendar entry. Resolves the
 * scrapbook directory via the content index when available (id binding),
 * falling back to slug-based addressing for entries that haven't been
 * bound to frontmatter yet (pre-doctor state).
 *
 * Mirrors the shape of `countScrapbookForEntry`. Used by the studio
 * review-page drawer + content-detail panel so writingcontrol-shape
 * entries (where the file path diverges from the slug template) list
 * items at the correct on-disk location.
 *
 * @param entry Calendar entry — `id` preferred; `slug` is both the
 *              legacy fallback and the disambiguator the underlying
 *              resolver uses when the index is incomplete.
 * @param index Optional pre-built per-request index. When omitted, the
 *              resolver builds one on demand.
 */
export function listScrapbookForEntry(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  entry: { id?: string; slug: string },
  index?: ContentIndex,
): ScrapbookSummary {
  const dir = scrapbookDirForEntry(projectRoot, config, site, entry, index);
  return listScrapbookAtDir(site, entry.slug, dir);
}

/** Internal helper — list files (not subdirs/dotfiles) at a given path. */
function listFilesInDir(dir: string): ScrapbookItem[] {
  const items: ScrapbookItem[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    if (e.name.startsWith('.')) continue;
    const abs = join(dir, e.name);
    const st = statSync(abs);
    items.push({
      name: e.name,
      kind: classify(e.name),
      size: st.size,
      mtime: st.mtime.toISOString(),
    });
  }
  items.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return items;
}

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

/**
 * Count items inside an absolute scrapbook directory — files at the top
 * level plus files inside the `secret/` subdirectory. Returns 0 if the
 * directory doesn't exist; tolerates fs errors so a transient permission
 * issue or race never crashes the dashboard render. Internal primitive
 * shared by `countScrapbook` (slug-based) and `countScrapbookForEntry`
 * (id-driven).
 */
function countScrapbookAtDir(dir: string): number {
  try {
    if (!existsSync(dir)) return 0;
    const top = listFilesInDir(dir);
    const secretDir = join(dir, SECRET_SUBDIR);
    const secret = existsSync(secretDir) ? listFilesInDir(secretDir) : [];
    return top.length + secret.length;
  } catch {
    return 0;
  }
}

/**
 * Total item count (public + secret). Used by the studio chip for the
 * badge — operators want a single "has scrapbook content" signal that
 * counts everything attached to this entry.
 *
 * Slug-based addressing: resolves `<contentDir>/<slug>/scrapbook/`. For
 * entries whose on-disk path doesn't match the slug template (e.g.
 * writingcontrol-shape projects where slug `the-outbound` lives at
 * `projects/the-outbound/index.md`), use `countScrapbookForEntry`
 * instead — it derives the path from the bound file via the content
 * index.
 */
export function countScrapbook(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
): number {
  try {
    const dir = _scrapbookDirSlug(projectRoot, config, site, slug);
    return countScrapbookAtDir(dir);
  } catch {
    return 0;
  }
}

/**
 * Count scrapbook items for a tracked calendar entry. Resolves the
 * scrapbook directory via the content index when available (id binding),
 * falling back to slug-based addressing for entries that haven't been
 * bound to frontmatter yet (pre-doctor state).
 *
 * Mirrors the shape of `scrapbookDirForEntry` — same resolver, same
 * legacy-slug fallback. Used by the studio dashboard chip so writing-
 * control-shape entries (where the file path diverges from the slug
 * template) report the correct count.
 *
 * @param entry Calendar entry — `id` preferred (Phase 19+); `slug` is
 *              both the legacy fallback and the disambiguator the
 *              underlying resolver uses when the index is incomplete.
 * @param index Optional pre-built per-request index. When omitted, the
 *              resolver builds one on demand.
 */
export function countScrapbookForEntry(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  entry: { id?: string; slug: string },
  index?: ContentIndex,
): number {
  try {
    const dir = scrapbookDirForEntry(projectRoot, config, site, entry, index);
    return countScrapbookAtDir(dir);
  } catch {
    return 0;
  }
}
