/**
 * group create — write a new group entry sidecar.
 *
 * Phase 7 Task 7.2 (graphical-entries). A group is an entry whose
 * `members` field is PRESENT (see `isGroupEntry`). At create time the
 * array is initialized empty (`members: []`); the operator populates
 * it via subsequent `add-member` calls. The `members`-present shape
 * is the group-declaration marker — `members: undefined` denotes a
 * regular (non-group) entry.
 *
 * Refuses when:
 *   - the lane id doesn't resolve (`loadLaneConfig` throws).
 *   - the lane is archived (creating into an archived lane is the
 *     same anti-pattern lane-move rejects).
 *   - a slug collision exists (a sidecar with the same slug is
 *     already on disk).
 *
 * Emits a `group-create` journal event on success.
 */

import { randomUUID } from 'node:crypto';
import { appendJournalEvent } from '../../journal/append.ts';
import { loadLaneConfig } from '../../lanes/loader.ts';
import { loadPipelineTemplate } from '../../pipelines/loader.ts';
import { readAllSidecars } from '../../sidecar/read-all.ts';
import { writeSidecar } from '../../sidecar/write.ts';
import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
import type { Entry } from '../../schema/entry.ts';

export interface CreateGroupOptions {
  readonly slug: string;
  readonly title: string;
  readonly lane: string;
  readonly artifactPath?: string;
  /** Test seam — defaults to `randomUUID()` when omitted. */
  readonly uuid?: string;
  /** Test seam — defaults to `new Date()` when omitted. */
  readonly now?: Date;
}

export interface CreateGroupResult {
  readonly entry: Entry;
}

export async function createGroup(
  projectRoot: string,
  opts: CreateGroupOptions,
): Promise<CreateGroupResult> {
  if (opts.slug.trim().length === 0) {
    throw new Error('Cannot create group: slug must be a non-empty string.');
  }
  if (opts.title.trim().length === 0) {
    throw new Error('Cannot create group: title must be a non-empty string.');
  }

  // Lane existence + archive check up front.
  const lane = loadLaneConfig(opts.lane, projectRoot);
  if (typeof lane.archivedAt === 'string' && lane.archivedAt.length > 0) {
    throw new Error(
      `Cannot create group "${opts.slug}" in archived lane "${opts.lane}". `
      + `Restore the lane first via "deskwork lane restore ${opts.lane}".`,
    );
  }

  // The group's `currentStage` defaults to the lane's first
  // linearStage — same default the `move` verb uses. A group with no
  // linearStages declared in its template can't have a starting
  // stage; surface that as an explicit configuration error.
  const template = loadPipelineTemplate(lane.pipelineTemplate, projectRoot);
  const startStage = template.linearStages[0];
  if (startStage === undefined) {
    throw new Error(
      `Cannot create group "${opts.slug}" in lane "${opts.lane}": `
      + `pipeline template "${template.id}" has no linearStages defined. `
      + `Repair the template before creating a group.`,
    );
  }

  // Slug-collision check — readAllSidecars throws on a malformed
  // sidecar, which is the right behaviour (don't quietly create a
  // group into a project with corrupt sidecars).
  const existing = await readAllSidecars(projectRoot);
  const collision = existing.find((e) => e.slug === opts.slug);
  if (collision !== undefined) {
    throw new Error(
      `Cannot create group "${opts.slug}": slug collision with `
      + `entry ${collision.uuid} (currentStage="${collision.currentStage}"). `
      + `Pick a different slug.`,
    );
  }

  const uuid = opts.uuid ?? randomUUID();
  const at = (opts.now ?? new Date()).toISOString();
  const entry: Entry = {
    uuid,
    slug: opts.slug,
    title: opts.title,
    keywords: [],
    source: 'group-create',
    currentStage: startStage,
    iterationByStage: {},
    lane: opts.lane,
    // The empty array is the group-declaration marker — `members`
    // PRESENT (even if empty) means "this entry is a group, just
    // not populated yet"; `members` ABSENT means "regular entry."
    // See `isGroupEntry` for the predicate semantic.
    members: [],
    ...(opts.artifactPath !== undefined && { artifactPath: opts.artifactPath }),
    createdAt: at,
    updatedAt: at,
  };

  // AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2):
  // wrap sidecar-write + journal-append in `withJournalRollback` so a
  // journal-append failure rolls back the sidecar to its pre-mutation
  // state. For `create` specifically, the snapshot records that the
  // sidecar was ABSENT before the call, so a failed create deletes
  // the just-created file rather than leaving an entry on disk with
  // no `group-create` audit event. Mirrors the compensating-write
  // pattern in `lane-config-missing-template` (AUDIT-20260530-79)
  // and `bootstrapDefaultLaneIfMissing` (AUDIT-20260530-13).
  await withJournalRollback(projectRoot, uuid, async () => {
    await writeSidecar(projectRoot, entry);
    await appendJournalEvent(projectRoot, {
      kind: 'group-create',
      at,
      entryId: uuid,
      details: {
        slug: opts.slug,
        lane: opts.lane,
        ...(opts.artifactPath !== undefined && { artifactPath: opts.artifactPath }),
      },
    });
  });

  return { entry };
}
