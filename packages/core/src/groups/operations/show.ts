/**
 * group show — return a group entry plus per-member lookups.
 *
 * Phase 7 Task 7.2 (graphical-entries). Resolves a slug or UUID to a
 * group entry, and enriches each member UUID with its own sidecar's
 * slug + title + lane + currentStage so the CLI / studio surfaces can
 * render the member row without making N more sidecar reads.
 *
 * Missing-member behaviour: when a member UUID does not resolve to a
 * sidecar, the per-member entry is returned with `missing: true` and
 * the slug / title / lane / currentStage fields absent. Doctor's
 * `group-member-missing` rule (Task 7.5.2) surfaces these for repair;
 * `group show` reports them verbatim so the operator sees the
 * dangling reference rather than the resolve-time error.
 *
 * Refuses when the resolved entry is not itself a group (i.e. has no
 * non-empty `members[]`) — the verb is group-specific; for non-group
 * entries, use the universal entry read paths.
 */

import { readSidecar } from '../../sidecar/read.ts';
import { resolveEntryUuid } from '../../sidecar/lookup.ts';
import type { Entry } from '../../schema/entry.ts';
import { isArchivedEntry, isGroupEntry } from '../types.ts';

export interface MemberSummary {
  readonly uuid: string;
  readonly missing: boolean;
  readonly slug?: string;
  readonly title?: string;
  readonly lane?: string;
  readonly currentStage?: string;
  readonly archived?: boolean;
}

export interface ShowGroupResult {
  readonly entry: Entry;
  readonly archived: boolean;
  readonly members: MemberSummary[];
}

export async function showGroup(
  projectRoot: string,
  slugOrUuid: string,
): Promise<ShowGroupResult> {
  const uuid = await resolveEntryUuid(projectRoot, slugOrUuid);
  const entry = await readSidecar(projectRoot, uuid);
  if (!isGroupEntry(entry)) {
    throw new Error(
      `Cannot show group "${slugOrUuid}": entry has no members. `
      + `Per the Task 7.1.2 invariant, only entries with a non-empty `
      + `\`members[]\` are groups. Use the universal entry read paths `
      + `for non-group entries.`,
    );
  }

  const memberUuids = entry.members ?? [];
  const members: MemberSummary[] = [];
  for (const memberUuid of memberUuids) {
    try {
      const member = await readSidecar(projectRoot, memberUuid);
      members.push({
        uuid: memberUuid,
        missing: false,
        slug: member.slug,
        title: member.title,
        ...(member.lane !== undefined && { lane: member.lane }),
        currentStage: member.currentStage,
        archived: isArchivedEntry(member),
      });
    } catch {
      members.push({ uuid: memberUuid, missing: true });
    }
  }

  return { entry, archived: isArchivedEntry(entry), members };
}
