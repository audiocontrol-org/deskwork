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
 * Refuses when the resolved entry is not itself a group (no
 * `members` field on the sidecar) — the verb is group-specific; for
 * non-group entries, use the universal entry read paths. An empty
 * group (`members: []`, no UUIDs yet) IS a group and shows with an
 * empty member list.
 */

import { existsSync } from 'node:fs';
import { readSidecar } from '../../sidecar/read.ts';
import { resolveEntryUuid } from '../../sidecar/lookup.ts';
import { sidecarPath } from '../../sidecar/paths.ts';
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
      `Cannot show group "${slugOrUuid}": entry is not a group `
      + `(no \`members\` field on the sidecar). Group-only verbs require `
      + `the \`members\` field to be present; regular entries should be `
      + `read via the universal entry paths.`,
    );
  }

  const memberUuids = entry.members ?? [];
  const members: MemberSummary[] = [];
  for (const memberUuid of memberUuids) {
    // Per AUDIT-20260530-89 (mirrors AUDIT-20260530-23 in cancel.ts):
    // narrow the recoverable `missing: true` case to the genuinely-
    // absent sidecar via an `existsSync` probe. The pre-fix code
    // wrapped `readSidecar` in a bare `catch {}` that pushed
    // `missing: true` for ANY thrown error, mislabeling corrupt-but-
    // on-disk sidecars as dangling references. Doctor's
    // `group-member-missing` rule then prompts the operator to delete
    // the reference, compounding the data loss. With the probe in
    // place, parse-failure / schema-failure / IO errors propagate so
    // real corruption surfaces loudly rather than masquerading as a
    // dangling UUID; only the genuine `file does not exist` case
    // yields `missing: true`.
    if (!existsSync(sidecarPath(projectRoot, memberUuid))) {
      members.push({ uuid: memberUuid, missing: true });
      continue;
    }
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
  }

  return { entry, archived: isArchivedEntry(entry), members };
}
