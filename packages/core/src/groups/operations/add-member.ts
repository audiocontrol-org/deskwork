/**
 * group add-member — append (or insert at index) a member UUID onto a
 * group's `members[]` array.
 *
 * Phase 7 Task 7.2 (graphical-entries). Per Step 7.2.3, members are
 * an ordered array — `add-member` defaults to APPEND; `--at <index>`
 * inserts at a 0-based position. Per Step 7.2.4, multi-group
 * membership is supported — the same entry UUID can appear in
 * multiple groups' `members[]` simultaneously. Per Step 7.2.5,
 * cross-lane membership is supported — the verb does NOT enforce
 * that the member lives in the same lane as the group.
 *
 * Refusals:
 *   - The target entry is not a group (does NOT have a non-empty
 *     `members[]`). The verb is group-specific.
 *
 *     Exception: a group created by `group create` carries
 *     `members: []` (the intent-marker per Task 7.5.5); `add-member`
 *     accepts that shape as "still a group" — the typeof check below
 *     looks for `Array.isArray(entry.members)` rather than
 *     `isGroupEntry`.
 *
 *   - The member UUID is already present in `members[]` (no
 *     duplicates within a single group — though the same UUID can be
 *     in multiple groups). Refuses with a clear error.
 *   - The member slug doesn't resolve to a sidecar.
 *   - `--at <index>` is out of range (`i < 0` or `i > members.length`).
 *   - Self-membership: the group's own UUID being added as its own
 *     member is refused — that would create a 1-element cycle which
 *     doctor's `group-recursive` rule (Task 7.5.1) would flag anyway.
 *     Refusing at write time gives a faster failure mode.
 *
 * Does NOT enforce recursion across multiple groups (a group whose
 * member is itself a group). That check belongs to doctor's
 * `group-recursive` rule (Task 7.5.1) per the workplan — the CLI
 * deliberately does NOT enforce recursion per the task scope.
 *
 * Emits a `group-add-member` journal event on success.
 */

import { appendJournalEvent } from '../../journal/append.ts';
import { readSidecar } from '../../sidecar/read.ts';
import { resolveEntryUuid } from '../../sidecar/lookup.ts';
import { writeSidecar } from '../../sidecar/write.ts';
import type { Entry } from '../../schema/entry.ts';

export interface AddGroupMemberOptions {
  readonly groupSlugOrUuid: string;
  readonly memberSlugOrUuid: string;
  /**
   * 0-based insertion index. When omitted, the member UUID is
   * appended (insertion at `members.length`). Must satisfy
   * `0 <= at <= members.length` — `at === members.length` is the
   * append case and is equivalent to omitting the flag.
   */
  readonly at?: number;
}

export interface AddGroupMemberResult {
  readonly entry: Entry;
  readonly memberId: string;
  readonly memberSlug: string;
  readonly index: number;
  readonly members: readonly string[];
}

export async function addGroupMember(
  projectRoot: string,
  opts: AddGroupMemberOptions,
): Promise<AddGroupMemberResult> {
  const groupUuid = await resolveEntryUuid(projectRoot, opts.groupSlugOrUuid);
  const group = await readSidecar(projectRoot, groupUuid);

  if (!Array.isArray(group.members)) {
    throw new Error(
      `Cannot add member to "${opts.groupSlugOrUuid}": entry has no `
      + `\`members\` field. Per the Task 7.1.2 invariant, only group `
      + `entries carry a \`members[]\` array. Create the group first via `
      + `"deskwork group create <slug> --lane <lane>".`,
    );
  }

  const memberUuid = await resolveEntryUuid(projectRoot, opts.memberSlugOrUuid);
  if (memberUuid === groupUuid) {
    throw new Error(
      `Cannot add member to "${opts.groupSlugOrUuid}": refused self-membership. `
      + `A group cannot contain itself as a member (1-element cycle).`,
    );
  }

  // Read the member's sidecar so we can include its slug in the
  // journal-event details (and to ensure the UUID actually points at
  // a sidecar — `resolveEntryUuid` only validates the UUID shape
  // when given a UUID, not slug, so a stale UUID would otherwise
  // sneak through).
  const member = await readSidecar(projectRoot, memberUuid);

  const currentMembers = group.members;
  if (currentMembers.includes(memberUuid)) {
    throw new Error(
      `Cannot add member to "${opts.groupSlugOrUuid}": member `
      + `"${member.slug}" (UUID ${memberUuid}) is already in this group. `
      + `Duplicates within a single group are refused; the same entry `
      + `CAN be a member of multiple groups simultaneously (Step 7.2.4).`,
    );
  }

  const insertIndex = opts.at ?? currentMembers.length;
  if (
    !Number.isInteger(insertIndex)
    || insertIndex < 0
    || insertIndex > currentMembers.length
  ) {
    throw new Error(
      `Cannot add member to "${opts.groupSlugOrUuid}": --at ${insertIndex} `
      + `is out of range. Valid range: 0..${currentMembers.length} (inclusive; `
      + `${currentMembers.length} is the append position).`,
    );
  }

  const nextMembers = [
    ...currentMembers.slice(0, insertIndex),
    memberUuid,
    ...currentMembers.slice(insertIndex),
  ];

  const at = new Date().toISOString();
  const updated: Entry = {
    ...group,
    members: nextMembers,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);

  await appendJournalEvent(projectRoot, {
    kind: 'group-add-member',
    at,
    entryId: groupUuid,
    details: {
      memberId: memberUuid,
      memberSlug: member.slug,
      index: insertIndex,
      membersAfter: nextMembers,
    },
  });

  return {
    entry: updated,
    memberId: memberUuid,
    memberSlug: member.slug,
    index: insertIndex,
    members: nextMembers,
  };
}
