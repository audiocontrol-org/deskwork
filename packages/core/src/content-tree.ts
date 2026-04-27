/**
 * Bird's-eye content-tree builder (Phase 16d).
 *
 * Derives a tree-of-nodes representation from the editorial calendar +
 * the on-disk scrapbook layout. Used by the studio's `/dev/content`
 * surface to render hierarchical content as a drillable tree.
 *
 * Inputs: a per-site list of calendar entries (already loaded by the
 * caller via `readCalendar`) and the host project's `DeskworkConfig`
 * for path resolution. The builder walks the slugs to assemble the
 * tree, fills in synthetic "organizational" nodes when a hierarchical
 * slug has missing intermediate parents (e.g. tracked
 * `the-outbound/characters/strivers` with no entry for
 * `the-outbound/characters`), and aggregates each node's scrapbook
 * count + most-recent mtime via the existing scrapbook lister.
 *
 * Read-only — never mutates the calendar or the filesystem. Callers
 * cache the result for the lifetime of a single request unless the
 * caller knows the underlying data has changed.
 */

import type { CalendarEntry, Stage } from './types.ts';
import type { DeskworkConfig } from './config.ts';
import { listScrapbook } from './scrapbook.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A node in the content tree. */
export interface ContentNode {
  /** Site slug — passed through from the input. */
  site: string;
  /**
   * Hierarchical slug (`/`-separated). For synthetic organizational
   * nodes, this is the prefix path; no calendar entry exists at this
   * slug (`entry === null`).
   */
  slug: string;
  /** Display title — `entry.title` when tracked, else the leaf slug segment. */
  title: string;
  /**
   * Lifecycle stage when the node corresponds to a tracked calendar
   * entry. `null` for synthetic organizational nodes.
   */
  lane: Stage | null;
  /**
   * Underlying calendar entry, when present. `null` for synthetic
   * organizational nodes that fill in missing parents.
   */
  entry: CalendarEntry | null;
  /**
   * True when the node has its own `index.md` / `README.md` on disk —
   * derived from the entry's `filePath` (or the default template) and
   * the file's basename. Used by the UI to pick branch / leaf icons.
   * Synthetic nodes are reported as `false`.
   */
  hasOwnIndex: boolean;
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
   * root slug, its `title` is used; otherwise the rootSlug verbatim.
   */
  title: string;
  /** Total tracked entries beneath this project (recursive). */
  trackedCount: number;
  /** Total tree nodes including synthetic parents (recursive). */
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

function basenameLooksLikeIndex(filePath: string): boolean {
  const last = filePath.split('/').pop() ?? '';
  const lower = last.toLowerCase();
  return (
    lower === 'index.md' ||
    lower === 'index.mdx' ||
    lower === 'index.markdown' ||
    lower === 'readme.md' ||
    lower === 'readme.mdx' ||
    lower === 'readme.markdown'
  );
}

function entryHasOwnIndex(entry: CalendarEntry): boolean {
  if (entry.filePath !== undefined && entry.filePath !== '') {
    return basenameLooksLikeIndex(entry.filePath);
  }
  // Default template `<slug>/index.md` → has own index.
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

  // Two passes:
  //   1. Index entries by slug; assemble synthetic ancestor slugs that
  //      need filling in.
  //   2. Build the tree from the union of real + synthetic slugs.
  const entryBySlug = new Map<string, CalendarEntry>();
  const allSlugs = new Set<string>();
  for (const e of entries) {
    entryBySlug.set(e.slug, e);
    allSlugs.add(e.slug);
    for (const a of ancestorsOf(e.slug)) allSlugs.add(a);
  }

  const sortedSlugs = [...allSlugs].sort();
  const nodeBySlug = new Map<string, ContentNode>();

  for (const slug of sortedSlugs) {
    const entry = entryBySlug.get(slug) ?? null;
    const sb = lookup(site, slug);
    const items = [...sb.items, ...sb.secretItems];
    const mostRecent = items.reduce<string | null>(
      (acc, it) => pickLatestMtime(acc, it.mtime),
      null,
    );
    const node: ContentNode = {
      site,
      slug,
      title: entry?.title ?? leafOfSlug(slug),
      lane: entry?.stage ?? null,
      entry,
      hasOwnIndex: entry === null ? false : entryHasOwnIndex(entry),
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
