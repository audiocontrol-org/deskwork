/**
 * group archive / group restore — flip the `archivedAt` field on a
 * group entry.
 *
 * Phase 7 Task 7.2 (graphical-entries). Soft-archive shape mirrors
 * `lane archive` (Task 6.1): the `archivedAt` field carries an ISO
 * datetime that doubles as the boolean signal and the audit trail.
 * Archive sets the field; restore clears it.
 *
 * Archive does NOT cancel the group or its members. Per the
 * universal-verb model (DESKWORK-STATE-MACHINE.md Commandment II) and
 * PRD line 323 ("Soft-archive preserves history, hides from active
 * dashboards"), an archived entry stays in the pipeline at its
 * current stage — verbs continue to work; only listing surfaces hide
 * the entry by default.
 *
 * Member archive cascade is NOT implied — archiving a group archives
 * the group entry only. Members may be archived independently
 * (calling `group archive` against each member individually). Cancel
 * cascade (`--cascade`) is a separate concern owned by the universal
 * `/deskwork:cancel` verb (Step 7.2.6).
 *
 * Refusals:
 *   - The target entry is not a group (does NOT carry a non-empty
 *     `members[]`). The verb is group-specific.
 *
 *     Per Task 7.5.5, a `members: []` entry is the "group with no
 *     members yet" intent-marker; archive accepts that shape as still-
 *     a-group (the typeof check is `Array.isArray(entry.members)`,
 *     not `isGroupEntry`).
 *
 *   - Archive when already archived; restore when not archived. Both
 *     surface the current state in the error so the operator knows
 *     why the verb refused.
 */

import { appendJournalEvent } from '../../journal/append.ts';
import { readSidecar } from '../../sidecar/read.ts';
import { resolveEntryUuid } from '../../sidecar/lookup.ts';
import { writeSidecar } from '../../sidecar/write.ts';
import type { Entry } from '../../schema/entry.ts';
import { isArchivedEntry } from '../types.ts';

export interface ArchiveGroupResult {
  readonly entry: Entry;
}

export async function archiveGroup(
  projectRoot: string,
  slugOrUuid: string,
): Promise<ArchiveGroupResult> {
  const uuid = await resolveEntryUuid(projectRoot, slugOrUuid);
  const existing = await readSidecar(projectRoot, uuid);
  if (!Array.isArray(existing.members)) {
    throw new Error(
      `Cannot archive group "${slugOrUuid}": entry has no \`members\` field. `
      + `Per the Task 7.1.2 invariant, only group entries carry a `
      + `\`members[]\` array.`,
    );
  }
  if (isArchivedEntry(existing)) {
    throw new Error(
      `Cannot archive group "${slugOrUuid}": already archived `
      + `(archivedAt=${existing.archivedAt}).`,
    );
  }

  const at = new Date().toISOString();
  const updated: Entry = {
    ...existing,
    archivedAt: at,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);
  await appendJournalEvent(projectRoot, {
    kind: 'group-archive',
    at,
    entryId: uuid,
    details: { archivedAt: at },
  });
  return { entry: updated };
}

export async function restoreGroup(
  projectRoot: string,
  slugOrUuid: string,
): Promise<ArchiveGroupResult> {
  const uuid = await resolveEntryUuid(projectRoot, slugOrUuid);
  const existing = await readSidecar(projectRoot, uuid);
  if (!Array.isArray(existing.members)) {
    throw new Error(
      `Cannot restore group "${slugOrUuid}": entry has no \`members\` field. `
      + `Per the Task 7.1.2 invariant, only group entries carry a `
      + `\`members[]\` array.`,
    );
  }
  if (!isArchivedEntry(existing)) {
    throw new Error(
      `Cannot restore group "${slugOrUuid}": not archived (no archivedAt field).`,
    );
  }

  // Strip archivedAt; keep every other field. `archivedAt` is
  // schema-optional, so the destructured `rest` is structurally
  // assignable to Entry without an explicit cast.
  const at = new Date().toISOString();
  const { archivedAt: _drop, ...rest } = existing;
  void _drop;
  const updated: Entry = {
    ...rest,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);
  await appendJournalEvent(projectRoot, {
    kind: 'group-restore',
    at,
    entryId: uuid,
  });
  return { entry: updated };
}
