/**
 * group list — enumerate every group entry in the project.
 *
 * Phase 7 Task 7.2 (graphical-entries). Walks every sidecar via
 * `readAllSidecars` and filters to those declared as groups (the
 * `members` field is present, regardless of population — `members:
 * []` IS a valid empty group, per `isGroupEntry`'s semantic). Active
 * by default; `includeArchived` includes entries carrying an
 * `archivedAt` marker.
 *
 * Sort order is alphabetical by slug, matching the lane-list
 * convention. The CLI's group list / studio surfaces can re-sort
 * downstream if needed.
 */

import { readAllSidecars } from '../../sidecar/read-all.ts';
import type { Entry } from '../../schema/entry.ts';
import { isArchivedEntry, isGroupEntry } from '../types.ts';

export interface ListGroupsOptions {
  /** Include archived groups (`archivedAt` set). Defaults to `false`. */
  readonly includeArchived?: boolean;
}

export interface ListedGroup {
  readonly entry: Entry;
  readonly archived: boolean;
  readonly memberCount: number;
}

export async function listGroups(
  projectRoot: string,
  opts: ListGroupsOptions = {},
): Promise<ListedGroup[]> {
  const includeArchived = opts.includeArchived ?? false;
  const all = await readAllSidecars(projectRoot);
  const groups = all.filter(isGroupEntry);
  const filtered = includeArchived
    ? groups
    : groups.filter((entry) => !isArchivedEntry(entry));
  return filtered
    .map((entry): ListedGroup => ({
      entry,
      archived: isArchivedEntry(entry),
      // `members` is guaranteed to be an array (possibly empty) by
      // `isGroupEntry`. `members.length` is safe; for a newly-created
      // empty group the count is 0 and the dashboard renders the
      // "no members yet" affordance.
      memberCount: entry.members?.length ?? 0,
    }))
    .sort((a, b) => a.entry.slug.localeCompare(b.entry.slug));
}
