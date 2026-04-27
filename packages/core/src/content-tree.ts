/**
 * Bird's-eye content-tree builder (Phase 16d, inverted in v0.6.0 / #24).
 *
 * Derives a tree-of-nodes representation from the host project's
 * filesystem, with the editorial calendar overlaid as a state layer.
 *
 *   - The **filesystem walk** is the primary structure source. Every
 *     directory under `<contentDir>/` becomes a node. Directories that
 *     contain a `README.md` (or `index.md`) are surfaced as
 *     organizational nodes when no calendar entry covers their slug.
 *   - The **calendar** is the state overlay. A calendar entry whose
 *     slug matches a fs node sets the node's lane (its lifecycle
 *     stage) and its display title. A calendar entry whose slug has
 *     no fs counterpart still appears (the calendar is authoritative
 *     for "this entry exists"); it just doesn't get a README excerpt.
 *
 * Read-only — never mutates the calendar or the filesystem. Callers
 * cache the result for the lifetime of a single request unless the
 * caller knows the underlying data has changed.
 *
 * Inversion rationale (#24): the studio's bird's-eye view should
 * surface organizational README nodes (e.g.
 * `the-outbound/characters/README.md` with no calendar entry) so the
 * operator sees the structure of the work — not just the calendar's
 * subset of it. Until v0.6.0 the calendar was primary and fs was an
 * ancestor-fill mechanism; that meant orgnizational READMEs were
 * invisible. Inverted: fs walks first; calendar overlays state.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CalendarEntry, Stage } from './types.ts';
import type { DeskworkConfig } from './config.ts';
import { listScrapbook } from './scrapbook.ts';
import { resolveContentDir } from './paths.ts';
import { parseFrontmatter } from './frontmatter.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A node in the content tree. */
export interface ContentNode {
  /** Site slug — passed through from the input. */
  site: string;
  /**
   * Hierarchical slug (`/`-separated). Either a tracked entry's slug
   * or a filesystem-discovered directory path under contentDir.
   */
  slug: string;
  /** Display title. Resolution order: calendar entry title → README/index frontmatter title → leaf slug segment. */
  title: string;
  /**
   * Lifecycle stage when the node corresponds to a tracked calendar
   * entry. `null` for organizational nodes (filesystem-only — no
   * calendar entry).
   */
  lane: Stage | null;
  /**
   * Underlying calendar entry, when present. `null` for organizational
   * filesystem nodes. Distinguishes "tracked / has lane" from
   * "structural only / no lane".
   */
  entry: CalendarEntry | null;
  /**
   * True when the node has its own `index.md` / `README.md` on disk.
   * Used by the UI to pick branch / leaf icons and (for organizational
   * nodes) to decide whether the detail panel can show a README excerpt.
   */
  hasOwnIndex: boolean;
  /**
   * True when the node was discovered by the filesystem walk
   * (independent of whether it has a calendar entry). Pure-calendar
   * nodes (entry exists, no fs directory) report false here. Used by
   * the studio detail panel to decide whether organizational README
   * content is fetchable.
   */
  hasFsDir: boolean;
  /** Items at `<contentDir>/<slug>/scrapbook/` (public + secret). */
  scrapbookCount: number;
  /**
   * Most recent mtime across the node's scrapbook items (ISO8601), or
   * `null` when the scrapbook is empty / absent.
   */
  scrapbookMostRecentMtime: string | null;
  /** Direct children — already sorted in slug order. */
  children: ContentNode[];
}

/**
 * Project-level tree summary returned by `buildContentTree`. Operators
 * use this both for the per-project drilldown and for the top-level
 * site cards (counts + lanes derive from the same shape).
 */
export interface ContentProject {
  site: string;
  /** First slug segment — the project root (e.g. `the-outbound`). */
  rootSlug: string;
  /**
   * Display name for the project. When a tracked entry exists at the
   * root slug, its `title` is used; otherwise the README frontmatter
   * title or the rootSlug verbatim.
   */
  title: string;
  /** Total tracked entries beneath this project (recursive). */
  trackedCount: number;
  /** Total tree nodes including organizational nodes (recursive). */
  totalNodes: number;
  /** Maximum depth (1 = single root node, 2 = root + leaves, …). */
  maxDepth: number;
  /** Sum of scrapbookCount across every node beneath this project. */
  scrapbookCount: number;
  /**
   * Predominant lane across tracked nodes — the most-frequent stage,
   * tie-broken by the lane order (`STAGES`). `null` when the project
   * has no tracked entries.
   */
  predominantLane: Stage | null;
  /** The project root node (its descendants live in `.children`). */
  root: ContentNode;
}

/**
 * One row of the filesystem walk: a directory found under contentDir,
 * plus the on-disk markers (README / index) used to decide whether
 * it's a candidate organizational node.
 */
export interface FsWalkEntry {
  /** Slug-style relative path from contentDir (e.g. `the-outbound/characters`). */
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

export interface BuildOptions {
  /**
   * Override scrapbook lookups — useful for tests that don't want to
   * depend on the real filesystem layout. Defaults to `listScrapbook`
   * from `@deskwork/core/scrapbook`.
   */
  scrapbookLookup?: (
    site: string,
    slug: string,
  ) => { items: { mtime: string }[]; secretItems: { mtime: string }[] };
  /**
   * Override the filesystem walk — used by tests to inject a synthetic
   * directory shape without writing to disk. Defaults to
   * `defaultFsWalk` (recursive walk under `resolveContentDir`).
   */
  fsWalk?: (site: string) => readonly FsWalkEntry[];
}

// ---------------------------------------------------------------------------
// Filesystem walk
// ---------------------------------------------------------------------------

/** Match the index/README basenames the studio recognizes as a node marker. */
const INDEX_BASENAMES = new Set([
  'index.md', 'index.mdx', 'index.markdown',
]);
const README_BASENAMES = new Set([
  'readme.md', 'readme.mdx', 'readme.markdown',
]);

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

  const visit = (dirAbs: string, slugSoFar: string): void => {
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
    if (slugSoFar !== '') {
      const title = titleSource ? readTitleFromMarkdown(titleSource) : null;
      out.push({ slug: slugSoFar, hasIndex, hasReadme, title });
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
      const childSlug = slugSoFar === '' ? name : `${slugSoFar}/${name}`;
      visit(childAbs, childSlug);
    }
  };

  visit(root, '');
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function leafOfSlug(slug: string): string {
  const idx = slug.lastIndexOf('/');
  return idx < 0 ? slug : slug.slice(idx + 1);
}

function ancestorsOf(slug: string): string[] {
  const segments = slug.split('/');
  const out: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    out.push(segments.slice(0, i).join('/'));
  }
  return out;
}

function rootSegment(slug: string): string {
  const idx = slug.indexOf('/');
  return idx < 0 ? slug : slug.slice(0, idx);
}

function entryHasOwnIndex(_entry: CalendarEntry): boolean {
  // Phase 19a dropped `CalendarEntry.filePath`; path-encoding now lives
  // in frontmatter `id:` resolved via the content index. Without an
  // explicit per-entry path override on the calendar row, the tree
  // assumes the host's default template (`<slug>/index.md`) — Phase
  // 19c will rewire this to consult the content index for the file's
  // real basename and decide hasOwnIndex from there.
  return true;
}

/** Return the most-recent ISO mtime across two values, or null when both are null. */
function pickLatestMtime(
  a: string | null,
  b: string | null,
): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Build the content-tree projects for one site. Pure data — no HTML,
 * no path-style decisions.
 *
 * Tree assembly is filesystem-primary (per #24): the walk returns every
 * directory under contentDir; the calendar entries layer state (lane,
 * title) on top. Slugs that exist in the calendar but have no fs
 * counterpart are still surfaced (the calendar is authoritative for
 * "this entry exists"); they render as nodes with `hasFsDir: false`.
 * Slugs that exist in the fs walk but have no calendar entry render
 * as organizational nodes (`entry: null`, `lane: null`).
 */
export function buildContentTree(
  site: string,
  entries: readonly CalendarEntry[],
  config: DeskworkConfig,
  projectRoot: string,
  options: BuildOptions = {},
): ContentProject[] {
  const lookup =
    options.scrapbookLookup ??
    ((siteArg, slug) => {
      try {
        return listScrapbook(projectRoot, config, siteArg, slug);
      } catch {
        return { items: [], secretItems: [] };
      }
    });

  const fsWalk =
    options.fsWalk ?? ((siteArg) => defaultFsWalk(projectRoot, config, siteArg));
  const fsEntries = fsWalk(site);
  const fsEntryBySlug = new Map<string, FsWalkEntry>();
  for (const e of fsEntries) fsEntryBySlug.set(e.slug, e);

  // Two passes:
  //   1. Index calendar entries by slug; assemble the union of slugs
  //      that need nodes (calendar slugs ∪ ancestors ∪ fs slugs).
  //   2. Build the tree from the union, sourcing each node's title
  //      and lane from the right authority (calendar wins when both
  //      sources have data).
  const entryBySlug = new Map<string, CalendarEntry>();
  const allSlugs = new Set<string>();

  // Calendar contributes its slugs and their ancestors.
  for (const e of entries) {
    entryBySlug.set(e.slug, e);
    allSlugs.add(e.slug);
    for (const a of ancestorsOf(e.slug)) allSlugs.add(a);
  }
  // Filesystem contributes any directory that has a README.md or
  // index.md (these are the candidates for organizational nodes), plus
  // the ancestors of those directories so the tree assembles.
  for (const e of fsEntries) {
    if (e.hasReadme || e.hasIndex) {
      allSlugs.add(e.slug);
      for (const a of ancestorsOf(e.slug)) allSlugs.add(a);
    }
  }

  const sortedSlugs = [...allSlugs].sort();
  const nodeBySlug = new Map<string, ContentNode>();

  for (const slug of sortedSlugs) {
    const entry = entryBySlug.get(slug) ?? null;
    const fsEntry = fsEntryBySlug.get(slug) ?? null;
    const sb = lookup(site, slug);
    const items = [...sb.items, ...sb.secretItems];
    const mostRecent = items.reduce<string | null>(
      (acc, it) => pickLatestMtime(acc, it.mtime),
      null,
    );

    // Title resolution: calendar wins, then fs frontmatter, then leaf.
    const title =
      entry?.title ??
      (fsEntry?.title ?? null) ??
      leafOfSlug(slug);

    // hasOwnIndex resolution: calendar entry implies the host template
    // (currently always `<slug>/index.md`); else fs walk's hasIndex ||
    // hasReadme. Phase 19c will route this through the content index
    // once entries bind to files via frontmatter id.
    let hasOwnIndex = false;
    if (entry !== null) {
      hasOwnIndex = entryHasOwnIndex(entry);
    } else if (fsEntry !== null) {
      hasOwnIndex = fsEntry.hasIndex || fsEntry.hasReadme;
    }

    const node: ContentNode = {
      site,
      slug,
      title,
      lane: entry?.stage ?? null,
      entry,
      hasOwnIndex,
      hasFsDir: fsEntry !== null,
      scrapbookCount: items.length,
      scrapbookMostRecentMtime: mostRecent,
      children: [],
    };
    nodeBySlug.set(slug, node);
  }

  // Wire up parent → child links by slug shape.
  for (const slug of sortedSlugs) {
    const parts = slug.split('/');
    if (parts.length === 1) continue;
    const parentSlug = parts.slice(0, -1).join('/');
    const parent = nodeBySlug.get(parentSlug);
    const node = nodeBySlug.get(slug);
    if (parent && node) parent.children.push(node);
  }

  // Group root-level slugs by project (their first segment) so the
  // top-level view can present per-project rollups.
  const projectRootBy: Map<string, ContentNode[]> = new Map();
  for (const slug of sortedSlugs) {
    if (slug.includes('/')) continue;
    const node = nodeBySlug.get(slug);
    if (!node) continue;
    const arr = projectRootBy.get(slug) ?? [];
    arr.push(node);
    projectRootBy.set(slug, arr);
  }

  // Some calendars have entries at slugs like `the-outbound/characters/strivers`
  // with NO root-level entry — so the project root is implicit. For
  // those cases, surface a synthetic project rooted at the first
  // segment.
  const knownRoots = new Set(projectRootBy.keys());
  for (const e of entries) {
    const root = rootSegment(e.slug);
    if (!knownRoots.has(root)) {
      // Build a synthetic root node with an empty scrapbook lookup.
      const sb = lookup(site, root);
      const items = [...sb.items, ...sb.secretItems];
      const mostRecent = items.reduce<string | null>(
        (acc, it) => pickLatestMtime(acc, it.mtime),
        null,
      );
      const synth: ContentNode = {
        site,
        slug: root,
        title: leafOfSlug(root),
        lane: null,
        entry: null,
        hasOwnIndex: false,
        hasFsDir: fsEntryBySlug.has(root),
        scrapbookCount: items.length,
        scrapbookMostRecentMtime: mostRecent,
        children: [],
      };
      nodeBySlug.set(root, synth);
      // Re-attach orphans whose direct parent was a missing
      // intermediate slug we hadn't generated; in the pre-loop pass
      // we already ensured every ancestor slug is in nodeBySlug, so
      // this only matters for the synthetic-root rooting.
      for (const slug of sortedSlugs) {
        if (rootSegment(slug) === root && slug.includes('/')) {
          const parentSlug = slug.split('/').slice(0, -1).join('/');
          if (parentSlug === root) {
            const child = nodeBySlug.get(slug);
            if (child && !synth.children.includes(child)) {
              synth.children.push(child);
            }
          }
        }
      }
      projectRootBy.set(root, [synth]);
    }
  }

  // Sort children deterministically.
  for (const node of nodeBySlug.values()) {
    node.children.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  // Fold each project root into a ContentProject summary.
  const projects: ContentProject[] = [];
  for (const [rootSlug, roots] of projectRootBy.entries()) {
    if (roots.length === 0) continue;
    const root = roots[0]; // Only one root per slug; defensive shape only.
    const summary = summarizeProject(site, rootSlug, root);
    projects.push(summary);
  }
  projects.sort((a, b) => a.rootSlug.localeCompare(b.rootSlug));
  return projects;
}

function summarizeProject(
  site: string,
  rootSlug: string,
  root: ContentNode,
): ContentProject {
  let trackedCount = 0;
  let totalNodes = 0;
  let maxDepth = 0;
  let scrapbookCount = 0;
  const laneCounts = new Map<Stage, number>();

  const visit = (node: ContentNode, depth: number) => {
    totalNodes += 1;
    maxDepth = Math.max(maxDepth, depth);
    scrapbookCount += node.scrapbookCount;
    if (node.entry !== null) {
      trackedCount += 1;
      const stage = node.entry.stage;
      laneCounts.set(stage, (laneCounts.get(stage) ?? 0) + 1);
    }
    for (const c of node.children) visit(c, depth + 1);
  };
  visit(root, 1);

  let predominantLane: Stage | null = null;
  let bestCount = 0;
  for (const [stage, count] of laneCounts.entries()) {
    if (count > bestCount) {
      predominantLane = stage;
      bestCount = count;
    }
  }

  return {
    site,
    rootSlug,
    title: root.title,
    trackedCount,
    totalNodes,
    maxDepth,
    scrapbookCount,
    predominantLane,
    root,
  };
}

/**
 * Helper: find the node with the given slug under a project tree, or
 * return null. Used by the studio's node-detail panel.
 */
export function findNode(
  project: ContentProject,
  slug: string,
): ContentNode | null {
  if (project.root.slug === slug) return project.root;
  const queue: ContentNode[] = [...project.root.children];
  while (queue.length > 0) {
    const head = queue.shift();
    if (!head) continue;
    if (head.slug === slug) return head;
    queue.push(...head.children);
  }
  return null;
}

/**
 * Flatten the tree into a depth-first ordered list of `(node, depth, isLast)`
 * triples for rendering. `depth` starts at 0 for the project root.
 * `isLast` is true when the node is the last child of its parent —
 * the UI uses it to truncate the tree connector lines.
 */
export interface FlatNode {
  node: ContentNode;
  depth: number;
  isLast: boolean;
}

export function flattenForRender(root: ContentNode): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (node: ContentNode, depth: number, isLast: boolean) => {
    out.push({ node, depth, isLast });
    const last = node.children.length - 1;
    for (let i = 0; i < node.children.length; i++) {
      walk(node.children[i], depth + 1, i === last);
    }
  };
  walk(root, 0, true);
  return out;
}
