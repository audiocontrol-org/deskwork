/**
 * Groups — shared type surface.
 *
 * Phase 7 Task 7.2 (graphical-entries). A "group" is an entry whose
 * `members[]` is non-empty (per Task 7.1.2 invariant — there is no
 * separate Group entity; same schema, same code paths, plus the
 * `members` field). These types name the option / result shapes for
 * the per-verb operations under `./operations/`.
 */

import type { Entry } from '../schema/entry.ts';

/**
 * Predicate used across the groups module: an Entry is a group when
 * `members` is present AND non-empty. An empty `members: []` and an
 * absent `members` field are both semantically equivalent to "regular
 * entry" — per Task 7.1.2 + Task 7.5.5 (`group-empty-members-array`
 * informational doctor rule).
 */
export function isGroupEntry(entry: Entry): boolean {
  return Array.isArray(entry.members) && entry.members.length > 0;
}

/**
 * Whether a group entry carries an `archivedAt` marker (Task 7.2). The
 * predicate is intentionally string-shape-aware: an empty string
 * resolves to false so legacy sidecars carrying `archivedAt: ""` are
 * treated as not-archived (mirrors the lane-archive convention).
 */
export function isArchivedEntry(entry: Entry): boolean {
  return typeof entry.archivedAt === 'string' && entry.archivedAt.length > 0;
}
