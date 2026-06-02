/**
 * group remove-member — remove a member UUID from a group's `members[]`.
 *
 * Phase 7 Task 7.2 (graphical-entries). Per CLI-discipline standard:
 * refuses when the member is not present (silent no-op would hide
 * operator typos). The removed member's other-group memberships are
 * untouched — multi-group membership is supported (Step 7.2.4) and
 * removing from one group doesn't affect the others.
 *
 * Refusals:
 *   - The target entry is not a group (does NOT carry a `members[]`
 *     array). The verb is group-specific.
 *   - The member slug doesn't resolve to a sidecar.
 *   - The member UUID is not present in the group's `members[]`.
 *
 * Emits a `group-remove-member` journal event on success.
 */

import { appendJournalEvent } from '../../journal/append.ts';
import { readSidecar } from '../../sidecar/read.ts';
import { resolveEntryUuid } from '../../sidecar/lookup.ts';
import { writeSidecar } from '../../sidecar/write.ts';
import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
import type { Entry } from '../../schema/entry.ts';

export interface RemoveGroupMemberOptions {
  readonly groupSlugOrUuid: string;
  readonly memberSlugOrUuid: string;
}

export interface RemoveGroupMemberResult {
  readonly entry: Entry;
  readonly memberId: string;
  readonly memberSlug: string;
  readonly members: readonly string[];
}

export async function removeGroupMember(
  projectRoot: string,
  opts: RemoveGroupMemberOptions,
): Promise<RemoveGroupMemberResult> {
  const groupUuid = await resolveEntryUuid(projectRoot, opts.groupSlugOrUuid);
  const group = await readSidecar(projectRoot, groupUuid);

  if (!Array.isArray(group.members)) {
    throw new Error(
      `Cannot remove member from "${opts.groupSlugOrUuid}": entry has no `
      + `\`members\` field. Per the Task 7.1.2 invariant, only group `
      + `entries carry a \`members[]\` array.`,
    );
  }

  const memberUuid = await resolveEntryUuid(projectRoot, opts.memberSlugOrUuid);
  const member = await readSidecar(projectRoot, memberUuid);

  const currentMembers = group.members;
  const index = currentMembers.indexOf(memberUuid);
  if (index === -1) {
    throw new Error(
      `Cannot remove member from "${opts.groupSlugOrUuid}": member `
      + `"${member.slug}" (UUID ${memberUuid}) is not in this group's `
      + `\`members[]\`. Current members: `
      + `${currentMembers.length === 0 ? '(none)' : currentMembers.join(', ')}.`,
    );
  }

  const nextMembers = [
    ...currentMembers.slice(0, index),
    ...currentMembers.slice(index + 1),
  ];

  const at = new Date().toISOString();
  const updated: Entry = {
    ...group,
    members: nextMembers,
    updatedAt: at,
  };
  // AUDIT-20260530-93: compensating-write protection. See
  // create.ts for the pattern rationale.
  await withJournalRollback(projectRoot, groupUuid, async () => {
    await writeSidecar(projectRoot, updated);
    await appendJournalEvent(projectRoot, {
      kind: 'group-remove-member',
      at,
      entryId: groupUuid,
      details: {
        memberId: memberUuid,
        memberSlug: member.slug,
        membersAfter: nextMembers,
      },
    });
  });

  return {
    entry: updated,
    memberId: memberUuid,
    memberSlug: member.slug,
    members: nextMembers,
  };
}
