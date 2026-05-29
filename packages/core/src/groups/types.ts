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
 * the `members` field is PRESENT (regardless of whether it carries
 * any UUIDs yet). `members: []` is the canonical "group declared,
 * awaiting members" state — `/deskwork:group create` writes this
 * shape so the dashboard / studio can render the newly-created
 * group immediately, before any `add-member` runs.
 *
 * An ABSENT `members` field denotes a regular (non-group) entry.
 *
 * The Task 7.1.2 schema invariant phrased this as "non-empty members
 * = group"; the CLI's group-create semantic in Task 7.2 demanded the
 * tighter shape ("members-field-present = group") so a brand-new
 * group is visible in `group list` immediately. See review-action
 * commit superseding AUDIT-20260529-13 for the resolution narrative.
 *
 * Use `isPopulatedGroupEntry` when the semantic you need is "group
 * AND has at least one member" — e.g. the multi-lane composed view
 * (Task 7.4) can't render member-row composition for a 0-member
 * group, and doctor's `group-all-members-cancelled` rule (Task
 * 7.5.3) should skip 0-member groups rather than firing an
 * informational on every newly-created one.
 */
export function isGroupEntry(entry: Entry): boolean {
  return Array.isArray(entry.members);
}

/**
 * Tighter predicate for "group with at least one member" — see
 * `isGroupEntry`'s doc-comment for the use cases that need this
 * semantic rather than the looser declared-group check.
 */
export function isPopulatedGroupEntry(entry: Entry): boolean {
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
