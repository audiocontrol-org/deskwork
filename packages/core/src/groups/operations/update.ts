/**
 * group update — mutate a subset of fields on an existing group entry.
 *
 * Phase 7 Task 7.2 (graphical-entries). Accepts an optional `title`
 * patch (the only field operators routinely re-name on a group). The
 * group's identity-bearing fields (`uuid`, `slug`, `lane`) are NOT
 * mutable through this verb — slug rename is the existing
 * `rename-slug` flow; lane move is `lane move`; uuid is immutable.
 *
 * The `members[]` field is intentionally NOT mutable through `update`
 * either — `add-member` / `remove-member` own those edits so the
 * `group-add-member` / `group-remove-member` journal events fire
 * with the right per-member context. A bulk `members:` patch would
 * lose that signal.
 *
 * Refusal:
 *   - When no patch fields are supplied, the operation is a no-op and
 *     throws. The verb requires explicit intent.
 *   - When the target entry is not itself a group (per
 *     `isGroupEntry`), refuses — `group update` is group-specific.
 *
 * Emits a `group-update` journal event on success.
 */

import { appendJournalEvent } from '../../journal/append.ts';
import { readSidecar } from '../../sidecar/read.ts';
import { resolveEntryUuid } from '../../sidecar/lookup.ts';
import { writeSidecar } from '../../sidecar/write.ts';
import type { Entry } from '../../schema/entry.ts';
import { isGroupEntry } from '../types.ts';

export interface UpdateGroupOptions {
  readonly slugOrUuid: string;
  readonly title?: string;
}

export interface UpdateGroupResult {
  readonly entry: Entry;
  readonly changedFields: readonly string[];
}

export async function updateGroup(
  projectRoot: string,
  opts: UpdateGroupOptions,
): Promise<UpdateGroupResult> {
  const uuid = await resolveEntryUuid(projectRoot, opts.slugOrUuid);
  const existing = await readSidecar(projectRoot, uuid);
  if (!isGroupEntry(existing)) {
    throw new Error(
      `Cannot update group "${opts.slugOrUuid}": entry has no members. `
      + `Per the Task 7.1.2 invariant, only entries with a non-empty `
      + `\`members[]\` are groups.`,
    );
  }

  const patches: Record<string, string> = {};
  if (opts.title !== undefined) {
    if (opts.title.trim().length === 0) {
      throw new Error(
        `Cannot update group "${opts.slugOrUuid}": --title must be a `
        + `non-empty string.`,
      );
    }
    patches['title'] = opts.title;
  }

  const changedFields = Object.keys(patches);
  if (changedFields.length === 0) {
    throw new Error(
      `Cannot update group "${opts.slugOrUuid}": no patch fields supplied. `
      + `Pass --title <text>.`,
    );
  }

  const at = new Date().toISOString();
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const field of changedFields) {
    before[field] = Reflect.get(existing, field);
    after[field] = patches[field];
  }

  const updated: Entry = {
    ...existing,
    ...patches,
    updatedAt: at,
  };

  await writeSidecar(projectRoot, updated);
  await appendJournalEvent(projectRoot, {
    kind: 'group-update',
    at,
    entryId: uuid,
    details: { changedFields, before, after },
  });

  return { entry: updated, changedFields };
}
