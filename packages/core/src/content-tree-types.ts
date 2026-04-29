/**
 * Public types for the bird's-eye content tree (Phase 16d / 19c).
 *
 * Extracted from `content-tree.ts` to keep the assembly module under
 * the project's 500-line guideline. The tree builder re-exports every
 * symbol from this module so callers continue importing from
 * `@deskwork/core/content-tree`.
 */

import type { CalendarEntry, Stage } from './types.ts';
import type { ContentIndex } from './content-index.ts';
import type { FsWalkEntry } from './content-tree-fs-walk.ts';

/** A node in the content tree. */
export interface ContentNode {
  /** Site slug — passed through from the input. */
  site: string;
  /**
   * Fs-relative path under contentDir (e.g. `projects/the-outbound`,
   * `essays/whats-in-a-name`). The structural key for the tree —
   * parent/child wiring, URL construction, and node lookup all go
   * through this field.
   *
   * Renamed from `slug` in Phase 19c (#33). For audiocontrol-shaped
   * flat blogs, this is identical to today's slug (`my-flat-post`);
   * for hierarchical content collections, this captures the actual
   * fs hierarchy independent of any host-derived public URL.
   */
  path: string;
  /**
   * Host-owned public URL slug — populated only when a calendar entry
   * is overlaid on this node. The studio uses this for the "public
   * URL: /blog/<slug>" hover hint. Not used internally by deskwork
   * for routing or path resolution. `undefined` for organizational
   * nodes and for fs nodes that have no calendar entry.
   */
  slug?: string;
  /**
   * Absolute path of the markdown file backing this node, when one
   * is known. Populated from the content index's id-binding (Issue #70)
   * — the actual on-disk file, not a slug-template ghost. The studio's
   * "file path" hint reads this to display the real path; renderers
   * that previously reconstructed `<path>/index.md` from `path` were
   * showing a path that didn't necessarily exist.
   *
   * `undefined` for ghost calendar entries (no fs binding yet) and for
   * organizational nodes without a tracked calendar entry. Callers
   * needing a fallback should check `hasOwnIndex` and fall back to
   * a path constructed from `path`.
   */
  filePath?: string;
  /** Display title. Resolution order: calendar entry title → README/index frontmatter title → leaf path segment. */
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
  /** Items at `<contentDir>/<path>/scrapbook/` (public + secret). */
  scrapbookCount: number;
  /**
   * Most recent mtime across the node's scrapbook items (ISO8601), or
   * `null` when the scrapbook is empty / absent.
   */
  scrapbookMostRecentMtime: string | null;
  /** Direct children — already sorted in path order. */
  children: ContentNode[];
}

/**
 * Project-level tree summary returned by `buildContentTree`. Operators
 * use this both for the per-project drilldown and for the top-level
 * site cards (counts + lanes derive from the same shape).
 */
export interface ContentProject {
  site: string;
  /**
   * First path segment — the project root (e.g. `projects` for
   * writingcontrol's hierarchical layout, or `my-flat-post` for an
   * audiocontrol-shaped flat blog). Pre-19c this was "first slug
   * segment"; post-19c the semantics shift to fs-driven. For flat
   * layouts the value is unchanged; for hierarchical layouts it now
   * captures the operator's organizational top-level (e.g. `projects`,
   * `essays`) rather than a per-entry slug.
   */
  rootSlug: string;
  /**
   * Display name for the project. When a tracked entry exists at the
   * root path, its `title` is used; otherwise the README frontmatter
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

/** Build-time options for `buildContentTree`. Test-friendly injection points. */
export interface BuildOptions {
  /**
   * Override scrapbook lookups — useful for tests that don't want to
   * depend on the real filesystem layout. Defaults to `listScrapbook`
   * from `@deskwork/core/scrapbook`.
   */
  scrapbookLookup?: (
    site: string,
    path: string,
  ) => { items: { mtime: string }[]; secretItems: { mtime: string }[] };
  /**
   * Override the filesystem walk — used by tests to inject a synthetic
   * directory shape without writing to disk. Defaults to
   * `defaultFsWalk` (recursive walk under `resolveContentDir`).
   */
  fsWalk?: (site: string) => readonly FsWalkEntry[];
  /**
   * Override the content index — used by tests + the studio's
   * per-request memoization. Defaults to `buildContentIndex` per call.
   * The index drives the entry-id → fs-path overlay; without it,
   * calendar entries fall through to the legacy slug-fallback path.
   */
  contentIndex?: ContentIndex;
  /**
   * Optional logger for the legacy slug-fallback warning. Tests inject
   * a spy here; production code lets it default to `console.warn`.
   * Receives one warning per calendar entry whose id wasn't found in
   * the content index but whose slug matched an fs node.
   */
  warn?: (message: string) => void;
}

/**
 * One row of the depth-first flatten — used by the studio's tree
 * renderer. `depth` starts at 0 for the project root; `isLast` is true
 * when the node is the last child of its parent (the UI uses it to
 * truncate tree connector lines).
 */
export interface FlatNode {
  node: ContentNode;
  depth: number;
  isLast: boolean;
}
