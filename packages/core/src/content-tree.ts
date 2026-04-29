/**
 * Bird's-eye content-tree builder (Phase 16d, fs-inverted in v0.6.0 / #24,
 * fs-keyed in Phase 19c / #33).
 *
 * Derives a tree-of-nodes representation from the host project's
 * filesystem, with the editorial calendar overlaid as a state layer.
 *
 *   - The **filesystem walk** is the primary structure source. Every
 *     directory under `<contentDir>/` becomes a node, keyed by its
 *     fs-relative path (e.g. `projects/the-outbound`).
 *   - The **calendar** is the state overlay. A calendar entry whose
 *     `id` matches an fs node's frontmatter `id:` (via the content
 *     index) sets the node's lane (its lifecycle stage), display
 *     title, AND the `slug` display attribute (the entry's
 *     host-rendering-engine slug, used by the studio for the
 *     "public URL: /blog/<slug>" hover hint).
 *
 * Read-only — never mutates the calendar or the filesystem. Callers
 * cache the result for the lifetime of a single request unless the
 * caller knows the underlying data has changed.
 *
 * Inversion rationale (#33): pre-19c the tree keyed nodes by **slug**.
 * This worked for audiocontrol's flat layout where slug == fs path,
 * but broke for writingcontrol where slug `the-outbound` (the
 * Astro-derived public URL) is unrelated to the file's path
 * (`projects/the-outbound/index.md`). The ghost-root bug came from
 * union-by-slug producing a calendar-only tree at slug
 * `the-outbound` plus a separate untracked tree under `projects/`
 * that never merged.
 *
 * Now: tree placement is filesystem-driven. Each fs node carries the
 * relative path (e.g. `projects/the-outbound`). Calendar entries
 * overlay state onto fs nodes by matching the entry's `id` against
 * the file's frontmatter `id:` via `buildContentIndex`. Slug stops
 * being load-bearing structurally and becomes a display attribute.
 *
 * Legacy slug-fallback (intentional, for pre-doctor entries): when a
 * calendar entry's id isn't found in the content index (its file
 * hasn't been bound to frontmatter yet), the assembly looks for an
 * fs node whose path equals the entry's slug. If found → overlay
 * with a one-time warning hinting at `deskwork doctor`. If not found
 * → place the entry as a ghost node (preserving today's behavior
 * for entries with neither id-binding nor a path-shaped slug).
 * This is NOT a "fallback for missing functionality" in the project
 * rule's sense — it's a deliberate transitional path that the doctor
 * command resolves operator-side.
 */

import type { CalendarEntry, Stage } from './types.ts';
import type { DeskworkConfig } from './config.ts';
import { buildContentIndex } from './content-index.ts';
import { listScrapbook } from './scrapbook.ts';
import { resolveContentDir } from './paths.ts';
import { defaultFsWalk, type FsWalkEntry } from './content-tree-fs-walk.ts';
import {
  ancestorsOf,
  entryHasOwnIndex,
  findIdBoundPath,
  idBoundFile,
  leafOfPath,
  pickLatestMtime,
  rootSegment,
} from './content-tree-helpers.ts';
import type {
  BuildOptions,
  ContentNode,
  ContentProject,
  FlatNode,
} from './content-tree-types.ts';

// Re-export the fs-walk + types so external callers (tests, studio) keep
// importing from `content-tree.ts` as today — the split is internal.
export { defaultFsWalk } from './content-tree-fs-walk.ts';
export type { FsWalkEntry } from './content-tree-fs-walk.ts';
export type {
  BuildOptions,
  ContentNode,
  ContentProject,
  FlatNode,
} from './content-tree-types.ts';

// ---------------------------------------------------------------------------
// Legacy slug-fallback warning de-duplication
// ---------------------------------------------------------------------------
//
// `buildContentTree` is called on every studio render (the dashboard polls
// at ~10s intervals). Pre-doctor entries that legitimately fall through to
// slug-as-path matching would otherwise emit the same warning hundreds of
// times an hour. Track which (site, entryId|slug) pairs have already
// warned this process and skip subsequent warnings.
//
// The Set lives at module scope on purpose — it intentionally outlives any
// single request. Tests that need fresh warning behavior should call the
// `__resetLegacyFallbackWarnings()` helper below in `beforeEach`.

const WARNED_LEGACY_FALLBACK: Set<string> = new Set();

/**
 * Test-only: clear the legacy slug-fallback warning de-dup set so tests
 * that exercise warning behavior can do so independently. Not part of the
 * public API — exposed only because process-level state is awkward to
 * reset from inside tests without a hook.
 */
export function __resetLegacyFallbackWarnings(): void {
  WARNED_LEGACY_FALLBACK.clear();
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Build the content-tree projects for one site. Pure data — no HTML,
 * no path-style decisions.
 *
 * Tree assembly (Phase 19c):
 *   1. Walk the fs (`fsWalk`) to enumerate every directory under
 *      contentDir. Each fs entry contributes a candidate node keyed by
 *      its fs-relative path.
 *   2. Build the content index (`buildContentIndex`) to map
 *      `relPath → entryId` based on frontmatter `id:`.
 *   3. For each fs node with a markdown index/README, look up the
 *      bound entry id via `index.byPath`, then resolve the calendar
 *      entry by id. If found → overlay state (lane, title from entry,
 *      slug as a display attribute).
 *   4. For calendar entries whose id is NOT in the index (their file
 *      isn't bound to frontmatter yet — pre-doctor state), do
 *      legacy slug fallback: look for an fs node whose path equals
 *      the entry's slug. If found → overlay with a one-time warning.
 *      If not found → place as a ghost node (today's behavior,
 *      preserved for backward compat).
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
    ((siteArg, path) => {
      try {
        return listScrapbook(projectRoot, config, siteArg, path);
      } catch {
        return { items: [], secretItems: [] };
      }
    });

  const fsWalk =
    options.fsWalk ?? ((siteArg) => defaultFsWalk(projectRoot, config, siteArg));
  const fsEntries = fsWalk(site);
  const fsEntryByPath = new Map<string, FsWalkEntry>();
  for (const e of fsEntries) fsEntryByPath.set(e.slug, e);

  const contentIndex =
    options.contentIndex ?? buildContentIndex(projectRoot, config, site);
  const warn = options.warn ?? ((msg) => console.warn(msg));
  const contentDir = resolveContentDir(projectRoot, config, site);

  // ---- Phase 1: assemble the union of paths that need nodes ----
  // Calendar entries contribute through TWO routes:
  //   (a) id-based binding: index.byPath[relPath] === entry.id binds
  //       the entry to that fs path. The path becomes the node key.
  //   (b) legacy slug fallback: when (a) doesn't fire, treat the
  //       entry's slug as a candidate path. If the fs walk includes
  //       it, overlay there with a warning. Otherwise it's a ghost.
  const allPaths = new Set<string>();
  // Track which calendar entries bind to which paths. The path is
  // either the fs-bound path (id-driven) or the entry's slug (legacy
  // fallback / ghost).
  const overlayByPath = new Map<string, CalendarEntry>();

  // Filesystem-derived paths first — every walked dir contributes its
  // own path AND its ancestors so the tree wires up cleanly.
  for (const e of fsEntries) {
    if (e.hasReadme || e.hasIndex) {
      allPaths.add(e.slug);
      for (const a of ancestorsOf(e.slug)) allPaths.add(a);
    }
  }

  // Determine each entry's binding target (id-based, slug-fallback, ghost).
  for (const entry of entries) {
    const idBoundPath = findIdBoundPath(entry, contentIndex);
    if (idBoundPath !== null) {
      overlayByPath.set(idBoundPath, entry);
      allPaths.add(idBoundPath);
      for (const a of ancestorsOf(idBoundPath)) allPaths.add(a);
      continue;
    }
    // Legacy slug-fallback: if the slug looks like an fs path AND
    // matches a walked dir, overlay there. Otherwise ghost.
    if (fsEntryByPath.has(entry.slug)) {
      overlayByPath.set(entry.slug, entry);
      allPaths.add(entry.slug);
      for (const a of ancestorsOf(entry.slug)) allPaths.add(a);
      // De-dup the warning per process — without this the studio's polled
      // dashboard re-emits the same warning on every render. Key by
      // (site, entryId | slug) so a renamed slug warns again.
      const dedupKey = `${site}:${entry.id ?? entry.slug}`;
      if (!WARNED_LEGACY_FALLBACK.has(dedupKey)) {
        WARNED_LEGACY_FALLBACK.add(dedupKey);
        warn(
          `[content-tree] Calendar entry "${entry.slug}" matched fs node by slug ` +
            `(no frontmatter id binding). Run \`deskwork doctor --fix=missing-frontmatter-id\` ` +
            `to make this binding refactor-proof.`,
        );
      }
      continue;
    }
    // Ghost: entry exists but has no fs counterpart at slug-equals-path
    // and no id binding. Surface it (the calendar is authoritative for
    // "this entry exists") so the operator sees it in the tree.
    allPaths.add(entry.slug);
    for (const a of ancestorsOf(entry.slug)) allPaths.add(a);
    overlayByPath.set(entry.slug, entry);
  }

  // ---- Phase 2: build nodes for every path in the union ----
  const sortedPaths = [...allPaths].sort();
  const nodeByPath = new Map<string, ContentNode>();

  for (const path of sortedPaths) {
    const overlay = overlayByPath.get(path) ?? null;
    const fsEntry = fsEntryByPath.get(path) ?? null;
    const sb = lookup(site, path);
    const items = [...sb.items, ...sb.secretItems];
    const mostRecent = items.reduce<string | null>(
      (acc, it) => pickLatestMtime(acc, it.mtime),
      null,
    );

    // Title resolution: calendar wins, then fs frontmatter, then leaf.
    const title =
      overlay?.title ??
      (fsEntry?.title ?? null) ??
      leafOfPath(path);

    // hasOwnIndex resolution + on-disk file path resolution. Both
    // depend on the content index's id-binding when an entry overlays
    // — the bound file is the SSOT for both the existence check
    // (`hasOwnIndex`) and the renderer's path display (Issue #70).
    let hasOwnIndex = false;
    let boundFile: string | undefined;
    if (overlay !== null) {
      boundFile = idBoundFile(overlay, contentIndex);
      hasOwnIndex = entryHasOwnIndex(
        contentDir,
        path,
        fsEntry?.hasIndex ?? false,
        fsEntry?.hasReadme ?? false,
        boundFile,
        fsEntry !== null,
      );
    } else if (fsEntry !== null) {
      hasOwnIndex = fsEntry.hasIndex || fsEntry.hasReadme;
    }

    const node: ContentNode = {
      site,
      path,
      title,
      lane: overlay?.stage ?? null,
      entry: overlay,
      hasOwnIndex,
      hasFsDir: fsEntry !== null,
      scrapbookCount: items.length,
      scrapbookMostRecentMtime: mostRecent,
      children: [],
    };
    if (overlay?.slug !== undefined) {
      // Slug only set when an entry overlays — used by the studio for
      // the "public URL" hover hint. Honoring exactOptionalPropertyTypes:
      // omit the field entirely rather than assigning undefined.
      node.slug = overlay.slug;
    }
    if (boundFile !== undefined) {
      // Issue #70: surface the actual on-disk path so the renderer
      // doesn't have to reconstruct `<path>/index.md` (which is wrong
      // for hierarchical / non-template layouts).
      node.filePath = boundFile;
    }
    nodeByPath.set(path, node);
  }

  // Wire up parent → child links by path shape.
  for (const path of sortedPaths) {
    const parts = path.split('/');
    if (parts.length === 1) continue;
    const parentPath = parts.slice(0, -1).join('/');
    const parent = nodeByPath.get(parentPath);
    const node = nodeByPath.get(path);
    if (parent && node) parent.children.push(node);
  }

  // Group root-level paths by project (their first segment).
  const projectRootBy: Map<string, ContentNode[]> = new Map();
  for (const path of sortedPaths) {
    if (path.includes('/')) continue;
    const node = nodeByPath.get(path);
    if (!node) continue;
    const arr = projectRootBy.get(path) ?? [];
    arr.push(node);
    projectRootBy.set(path, arr);
  }

  // Calendars with entries at deep paths and no top-level fs node
  // need a synthetic project root at the first path segment.
  const knownRoots = new Set(projectRootBy.keys());
  for (const e of entries) {
    // Compute the path the entry resolves to (id-bound or slug).
    const idBoundPath = findIdBoundPath(e, contentIndex);
    const entryPath = idBoundPath ?? e.slug;
    const root = rootSegment(entryPath);
    if (!knownRoots.has(root)) {
      const sb = lookup(site, root);
      const items = [...sb.items, ...sb.secretItems];
      const mostRecent = items.reduce<string | null>(
        (acc, it) => pickLatestMtime(acc, it.mtime),
        null,
      );
      const synth: ContentNode = {
        site,
        path: root,
        title: leafOfPath(root),
        lane: null,
        entry: null,
        hasOwnIndex: false,
        hasFsDir: fsEntryByPath.has(root),
        scrapbookCount: items.length,
        scrapbookMostRecentMtime: mostRecent,
        children: [],
      };
      nodeByPath.set(root, synth);
      // Re-attach orphans whose direct parent was a missing
      // intermediate path we hadn't generated.
      for (const path of sortedPaths) {
        if (rootSegment(path) === root && path.includes('/')) {
          const parentPath = path.split('/').slice(0, -1).join('/');
          if (parentPath === root) {
            const child = nodeByPath.get(path);
            if (child && !synth.children.includes(child)) {
              synth.children.push(child);
            }
          }
        }
      }
      projectRootBy.set(root, [synth]);
      knownRoots.add(root);
    }
  }

  // Sort children deterministically.
  for (const node of nodeByPath.values()) {
    node.children.sort((a, b) => a.path.localeCompare(b.path));
  }

  // Fold each project root into a ContentProject summary.
  const projects: ContentProject[] = [];
  for (const [rootPath, roots] of projectRootBy.entries()) {
    if (roots.length === 0) continue;
    const root = roots[0];
    const summary = summarizeProject(site, rootPath, root);
    projects.push(summary);
  }
  projects.sort((a, b) => a.rootSlug.localeCompare(b.rootSlug));
  return projects;
}

function summarizeProject(
  site: string,
  rootPath: string,
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
    rootSlug: rootPath,
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
 * Helper: find the node with the given path under a project tree, or
 * return null. Used by the studio's node-detail panel.
 */
export function findNode(
  project: ContentProject,
  path: string,
): ContentNode | null {
  if (project.root.path === path) return project.root;
  const queue: ContentNode[] = [...project.root.children];
  while (queue.length > 0) {
    const head = queue.shift();
    if (!head) continue;
    if (head.path === path) return head;
    queue.push(...head.children);
  }
  return null;
}

/**
 * Flatten the tree into a depth-first ordered list. See `FlatNode` in
 * `content-tree-types.ts` for the row shape.
 */
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
