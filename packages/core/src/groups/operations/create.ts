/**
 * group create — write a new group entry sidecar.
 *
 * Phase 7 Task 7.2 (graphical-entries). A group is an entry whose
 * `members[]` is non-empty (Task 7.1.2). At create time the array is
 * initially empty; the operator populates it via subsequent
 * `add-member` calls.
 *
 * Decision rationale for "empty members at create time":
 *
 *   The Task 7.1.2 invariant says non-empty `members[]` is the GROUP
 *   signal, but a newly-created group has no members yet. The schema
 *   tolerates this — an entry with `members: []` is structurally a
 *   regular entry until the operator adds the first member. The
 *   `group create` verb writes the entry with `members: []` (NOT
 *   `members: undefined`) so the dashboard / studio can distinguish
 *   "intended-as-a-group, awaiting members" from "regular entry that
 *   happens to have no members." Doctor's `group-empty-members-array`
 *   informational rule (Task 7.5.5) surfaces this dual-representation;
 *   here we deliberately write the empty array so the intent survives
 *   the round-trip.
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
    // Per the docblock: write `members: []` (not undefined) so the
    // dashboard / studio can distinguish intended-group from
    // accidental-empty. Doctor's `group-empty-members-array` rule
    // (Task 7.5.5) surfaces the dual representation; here we
    // deliberately write the empty array as the group-intent marker.
    members: [],
    ...(opts.artifactPath !== undefined && { artifactPath: opts.artifactPath }),
    createdAt: at,
    updatedAt: at,
  };

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

  return { entry };
}
