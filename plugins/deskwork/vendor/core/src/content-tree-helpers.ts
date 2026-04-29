/**
 * Internal helpers for `content-tree.ts`. Path-shape utilities, id-binding
 * lookups, and the `hasOwnIndex` decision. Extracted to keep the main
 * tree-assembly module under the project's 500-line guideline.
 *
 * No public API here — the tree builder re-exports what callers need.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CalendarEntry } from './types.ts';
import type { ContentIndex } from './content-index.ts';
import {
  INDEX_BASENAMES,
  TEMPLATE_INDEX_BASENAMES,
} from './content-tree-fs-walk.ts';

/** Last segment of a `/`-separated path. */
export function leafOfPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx < 0 ? path : path.slice(idx + 1);
}

/** Every prefix path of a `/`-separated path, excluding the path itself. */
export function ancestorsOf(path: string): string[] {
  const segments = path.split('/');
  const out: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    out.push(segments.slice(0, i).join('/'));
  }
  return out;
}

/** First segment of a `/`-separated path. */
export function rootSegment(path: string): string {
  const idx = path.indexOf('/');
  return idx < 0 ? path : path.slice(0, idx);
}

/**
 * Decide `hasOwnIndex` for a tracked entry.
 *
 * Order:
 *   1. The content index binds the entry to a real file → `true`.
 *   2. The fs walk found an index/README at this path → `true`.
 *   3. A template-path file actually exists on disk → `true` (covers
 *      the pre-bind case where the file is at `<path>/index.md` but
 *      the walk didn't surface this directory because we synthesized
 *      it from the calendar — should be rare post-19c).
 *   4. Calendar-only entry (no fs node, no id binding): default to
 *      `true` because the host renderer's template implies a file at
 *      `<path>/index.md`. Pre-19c behavior for ghost entries.
 */
export function entryHasOwnIndex(
  contentDir: string,
  entryPath: string,
  fsHasIndex: boolean,
  fsHasReadme: boolean,
  boundFile: string | undefined,
  hasFsDir: boolean,
): boolean {
  if (boundFile !== undefined) return true;
  if (fsHasIndex) return true;
  if (fsHasReadme) return true;
  for (const basename of TEMPLATE_INDEX_BASENAMES) {
    if (existsSync(join(contentDir, entryPath, basename))) return true;
  }
  // No fs evidence at all — calendar-only ghost. Assume the host
  // template (`<path>/index.md`) so detail-panel paths remain
  // discoverable for entries that haven't been scaffolded yet.
  if (!hasFsDir) return true;
  return false;
}

/** Return the most-recent ISO mtime across two values, or null when both are null. */
export function pickLatestMtime(
  a: string | null,
  b: string | null,
): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

/**
 * If the relative path ends with a recognized index file basename
 * (`index.md`, `index.mdx`, `index.markdown`), return the parent
 * directory path. Otherwise return the path unchanged. Used to map
 * `projects/the-outbound/index.md` (the file) → `projects/the-outbound`
 * (the tree node).
 *
 * Files at flat paths (e.g. `my-flat-post.md`) keep their full path
 * minus the extension as the node key. This matches today's
 * audiocontrol shape where the slug is the basename.
 */
export function stripIndexBasename(relPath: string): string {
  const segments = relPath.split('/');
  const last = segments[segments.length - 1].toLowerCase();
  if (INDEX_BASENAMES.has(last)) {
    return segments.slice(0, -1).join('/');
  }
  const dotIdx = last.lastIndexOf('.');
  if (dotIdx > 0) {
    const stripped = segments.slice(0, -1);
    stripped.push(last.slice(0, dotIdx));
    return stripped.join('/');
  }
  return relPath;
}

/**
 * Find the fs path that the content index binds to this entry's id, or
 * null when the entry has no id or its id isn't in the index.
 */
export function findIdBoundPath(
  entry: CalendarEntry,
  index: ContentIndex,
): string | null {
  if (typeof entry.id !== 'string' || entry.id === '') return null;
  // Reverse-lookup byPath for value === entry.id. Keeps the index
  // single-source-of-truth without us needing a third map.
  for (const [path, id] of index.byPath.entries()) {
    if (id === entry.id) return stripIndexBasename(path);
  }
  return null;
}

/** Absolute path to the file the index binds to this entry, or undefined. */
export function idBoundFile(
  entry: CalendarEntry,
  index: ContentIndex,
): string | undefined {
  if (typeof entry.id !== 'string' || entry.id === '') return undefined;
  return index.byId.get(entry.id);
}
