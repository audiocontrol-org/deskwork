/**
 * Content-tree filesystem walk — pure recursive directory scan.
 *
 * Extracted from `content-tree.ts` (Phase 19c) to keep that file under
 * the project's 500-line guideline. The walk is read-only and produces
 * one `FsWalkEntry` per directory beneath `<contentDir>` — the input
 * to the tree assembly's fs-primary inversion.
 *
 * No knowledge of the calendar or content index lives here.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DeskworkConfig } from './config.ts';
import { resolveContentDir } from './paths.ts';
import { parseFrontmatter } from './frontmatter.ts';

/**
 * One row of the filesystem walk: a directory found under contentDir,
 * plus the on-disk markers (README / index) used to decide whether
 * it's a candidate organizational node.
 */
export interface FsWalkEntry {
  /**
   * Fs-relative path from contentDir (e.g. `the-outbound/characters`).
   * Field name retained as `slug` for backward-compat with existing
   * test fixtures and external callers; semantically it is now an
   * "fs path" — kebab-case segments separated by `/`.
   */
  slug: string;
  /** True when the directory has an `index.md` / `index.mdx` file. */
  hasIndex: boolean;
  /**
   * True when the directory has a `README.md` / `README.mdx` file.
   * Used to surface organizational nodes that aren't part of the
   * calendar's tracked set.
   */
  hasReadme: boolean;
  /** Title from the README/index frontmatter `title` field, when present. */
  title: string | null;
}

/** Match the index/README basenames the studio recognizes as a node marker. */
export const INDEX_BASENAMES: ReadonlySet<string> = new Set([
  'index.md', 'index.mdx', 'index.markdown',
]);
const README_BASENAMES: ReadonlySet<string> = new Set([
  'readme.md', 'readme.mdx', 'readme.markdown',
]);

/**
 * Index file basenames the host's default template (`<path>/index.md`)
 * recognises. Used to decide `hasOwnIndex` for tracked entries when the
 * content index doesn't bind them to a specific file (pre-doctor state).
 */
export const TEMPLATE_INDEX_BASENAMES: readonly string[] = [
  'index.md',
  'index.mdx',
  'index.markdown',
];

function readTitleFromMarkdown(absPath: string): string | null {
  try {
    const raw = readFileSync(absPath, 'utf-8');
    const parsed = parseFrontmatter(raw);
    const t = parsed.data.title;
    if (typeof t === 'string' && t.trim().length > 0) return t.trim();
  } catch {
    // Unreadable / unparseable — fall through.
  }
  return null;
}

/**
 * Default filesystem walk — recursively scan a site's contentDir for
 * directories. Returns one `FsWalkEntry` per directory beneath
 * contentDir (not contentDir itself). Skips dotfiles and the
 * conventional non-content names (`scrapbook`, `node_modules`, etc.).
 *
 * Per-directory the walk records whether an `index.md` / `README.md`
 * is present and (when present) reads the frontmatter `title`.
 */
export function defaultFsWalk(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
): FsWalkEntry[] {
  const root = resolveContentDir(projectRoot, config, site);
  if (!existsSync(root)) return [];
  const out: FsWalkEntry[] = [];
  const SKIP = new Set(['scrapbook', 'node_modules', 'dist', '.git']);

  const visit = (dirAbs: string, pathSoFar: string): void => {
    let names: string[];
    try {
      names = readdirSync(dirAbs);
    } catch {
      return;
    }
    let hasIndex = false;
    let hasReadme = false;
    let titleSource: string | null = null;
    for (const name of names) {
      const lower = name.toLowerCase();
      if (INDEX_BASENAMES.has(lower)) {
        hasIndex = true;
        if (titleSource === null) titleSource = join(dirAbs, name);
      } else if (README_BASENAMES.has(lower)) {
        hasReadme = true;
        // Prefer index.md as the title source when both exist; only
        // fall back to README when there is no index.
        if (titleSource === null && !hasIndex) titleSource = join(dirAbs, name);
      }
    }
    if (pathSoFar !== '') {
      const title = titleSource ? readTitleFromMarkdown(titleSource) : null;
      out.push({ slug: pathSoFar, hasIndex, hasReadme, title });
    }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      if (SKIP.has(name.toLowerCase())) continue;
      const childAbs = join(dirAbs, name);
      let childStat;
      try {
        childStat = statSync(childAbs);
      } catch {
        continue;
      }
      if (!childStat.isDirectory()) continue;
      const childPath = pathSoFar === '' ? name : `${pathSoFar}/${name}`;
      visit(childAbs, childPath);
    }
  };

  visit(root, '');
  return out;
}
