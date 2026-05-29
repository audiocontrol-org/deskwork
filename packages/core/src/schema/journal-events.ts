import { z } from 'zod';
import { EntrySchema } from './entry.ts';
import { AnnotationSchema } from './annotation.ts';
import { DraftAnnotationSchema } from './draft-annotation.ts';

/**
 * Per Phase 3 (graphical-entries) Task 3.2.2: stage values on journal
 * events are now any non-empty string, validated at runtime against
 * the entry's lane template rather than against a global enum. The
 * legacy `StageEnum` 8-value list is retired from the schema; readers
 * that still want to narrow to the editorial-default vocabulary can
 * do so explicitly via `schema/entry.ts#StageEnum`.
 */
const StageStringSchema = z.string().min(1, 'stage must be a non-empty string');
const ReviewStateEnum = z.enum(['in-review', 'iterating', 'approved']);

const EntryCreatedEvent = z.object({
  kind: z.literal('entry-created'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  entry: EntrySchema,
});

const EntryIngestedEvent = z.object({
  kind: z.literal('entry-ingested'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  sourcePath: z.string(),
  targetStage: StageStringSchema,
});

const IterationEvent = z.object({
  kind: z.literal('iteration'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  stage: StageStringSchema,
  version: z.number().int().positive(),
  markdown: z.string(),
});

const AnnotationEvent = z.object({
  kind: z.literal('annotation'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  stage: StageStringSchema,
  version: z.number().int().positive(),
  annotation: AnnotationSchema,
});

// LEGACY READ-ONLY. Per `DESKWORK-STATE-MACHINE.md` Commandment III,
// review-state is retired — new code MUST NOT emit `review-state-change`
// events. This variant remains in the discriminated union solely so
// historical journals parse cleanly for read paths (calendar render,
// audit-log import, etc.). Any new code path that appends a journal
// event of this kind should be rejected in code review.
const ReviewStateChangeEvent = z.object({
  kind: z.literal('review-state-change'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  stage: StageStringSchema,
  from: ReviewStateEnum.nullable(),
  to: ReviewStateEnum.nullable(),
});

/**
 * `metadata.cascadeFrom` (Step 7.2.8, graphical-entries, GitHub #359):
 * when a `stage-transition` event is emitted for a cascaded member of
 * a group cancel `--cascade` walk, `metadata.cascadeFrom` carries the
 * UUID of the originating (top-level) group whose cascade invocation
 * propagated to this entry. The originator's OWN event does NOT carry
 * `cascadeFrom` — only the cascaded members' events do. The field is
 * the top-level originator's UUID even on transitively-cascaded entries
 * (recursive groups), so audit consumers can answer "which cascade
 * invocation caused this cancel?" with a single field read.
 *
 * `metadata` is `.passthrough()` so future enhancement to the metadata
 * bag doesn't require a schema-level enumeration churn; consumers MAY
 * record additional keys without invalidating existing events.
 */
const StageTransitionEvent = z.object({
  kind: z.literal('stage-transition'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  from: StageStringSchema,
  to: StageStringSchema,
  reason: z.string().optional(),
  metadata: z
    .object({
      cascadeFrom: z.string().uuid().optional(),
    })
    .passthrough()
    .optional(),
});

/**
 * Phase 34a: entry-keyed annotation event. Distinct from `AnnotationEvent`
 * (which uses the lighter `AnnotationSchema` and is keyed on
 * `(entryId, stage, version)`), this event carries the full
 * `DraftAnnotation` shape used by the longform review surface, keyed
 * on `entryId` only. The two stores intentionally do not interoperate
 * — see `entry/annotations.ts` and the api.ts header for the split
 * contract.
 */
const EntryAnnotationEvent = z.object({
  kind: z.literal('entry-annotation'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  annotation: DraftAnnotationSchema,
});

/**
 * Phase 3 (graphical-entries): records lane-aware migration steps that
 * happen at project bootstrap. Today the only emitter is the default-
 * lane bootstrap helper (legacy `sites.<defaultSite>.contentDir` → new
 * `.deskwork/lanes/default.json` bound to `editorial`); future
 * migrations (entry-sidecar lane back-fill, content-tree rehoming,
 * etc.) will land additional events under this kind.
 *
 * The event is project-scoped (no `entryId`); `source` and `target`
 * identify the migration's logical inputs and outputs, and `details`
 * carries free-form key/value context (e.g. the legacy site id, the
 * resolved contentDir).
 */
const LaneMigrationEvent = z.object({
  kind: z.literal('lane-migration'),
  at: z.string().datetime(),
  migration: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  // `details` is an intentionally free-form context bag. Lane bootstrap
  // carries strings (siteId, contentDir, templateId); future migration
  // kinds may need numbers (entry counts), booleans (dry-run flags),
  // or nested arrays (per-entry results). `z.unknown()` so the schema
  // doesn't churn each time a migration variant lands; readers walk the
  // shape they need.
  details: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Phase 6 Task 6.1 (graphical-entries): lane-lifecycle events emitted
 * by the `/deskwork:lane` verb family. Each event is project-scoped
 * (no `entryId`); `laneId` identifies the lane the operation acted on
 * and `details` carries kind-specific context (the source / target
 * fields on `lane-update` / `lane-move`, the stage chosen on
 * `lane-move`, etc.).
 *
 * The six kinds mirror the six mutating verbs:
 *
 *   - `lane-create`  — a new lane config was written.
 *   - `lane-update`  — an existing lane's `name`, `pipelineTemplate`,
 *                      or `contentDir` was updated.
 *   - `lane-archive` — a lane was soft-archived (its `archivedAt`
 *                      field was set; the JSON stays on disk).
 *   - `lane-restore` — a lane's `archivedAt` field was cleared.
 *   - `lane-purge`   — a lane's JSON was deleted from disk. Refused
 *                      when any entry still references the lane.
 *   - `lane-move`    — an entry was moved from one lane to another;
 *                      the entry's `lane` and `currentStage` were
 *                      updated and the artifact file (plus
 *                      scrapbook) was relocated under the new lane's
 *                      `contentDir`.
 *
 * `lane-move` additionally carries `entryId` (UUID) because the move
 * is also an entry-state mutation; the dashboard / studio surfaces
 * may key on it. The other five kinds are project-level and do not
 * carry an entry id.
 */
const LaneCreateEvent = z.object({
  kind: z.literal('lane-create'),
  at: z.string().datetime(),
  laneId: z.string().min(1),
  details: z.object({
    name: z.string().min(1),
    pipelineTemplate: z.string().min(1),
    contentDir: z.string().min(1),
  }),
});

const LaneUpdateEvent = z.object({
  kind: z.literal('lane-update'),
  at: z.string().datetime(),
  laneId: z.string().min(1),
  details: z.object({
    changedFields: z.array(z.string().min(1)).min(1),
    before: z.record(z.string(), z.unknown()),
    after: z.record(z.string(), z.unknown()),
  }),
});

const LaneArchiveEvent = z.object({
  kind: z.literal('lane-archive'),
  at: z.string().datetime(),
  laneId: z.string().min(1),
});

const LaneRestoreEvent = z.object({
  kind: z.literal('lane-restore'),
  at: z.string().datetime(),
  laneId: z.string().min(1),
});

const LanePurgeEvent = z.object({
  kind: z.literal('lane-purge'),
  at: z.string().datetime(),
  laneId: z.string().min(1),
  details: z.object({
    purgedPath: z.string().min(1),
  }),
});

const LaneMoveEvent = z.object({
  kind: z.literal('lane-move'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  details: z.object({
    fromLane: z.string().min(1),
    toLane: z.string().min(1),
    fromStage: StageStringSchema,
    toStage: StageStringSchema,
    fromArtifactPath: z.string().optional(),
    toArtifactPath: z.string().optional(),
  }),
});

/**
 * Phase 6 Task 6.5 (graphical-entries): doctor-repair record for a lane
 * config whose `pipelineTemplate` reference does not resolve. The
 * `lane-config-missing-template` rule emits this event after applying
 * either a `set-template` rebind (with `before` / `after` template ids)
 * or a `delete` of the lane file (with `deleted: true`).
 *
 * The event is project-scoped (no `entryId`); `laneId` identifies the
 * lane the repair acted on. `ruleId` records the originating doctor
 * rule so an audit trail can be filtered by which rule wrote the entry.
 */
const LaneConfigRepairEvent = z.object({
  kind: z.literal('lane-config-repair'),
  at: z.string().datetime(),
  laneId: z.string().min(1),
  ruleId: z.string().min(1),
  details: z.union([
    z.object({
      action: z.literal('set-template'),
      before: z.string().min(1),
      after: z.string().min(1),
    }),
    z.object({
      action: z.literal('delete'),
      deleted: z.literal(true),
      laneFilePath: z.string().min(1),
    }),
  ]),
});

/**
 * Phase 6 Task 6.2 (graphical-entries): pipeline-template-lifecycle
 * events emitted by the `/deskwork:pipeline` verb family. Each event is
 * project-scoped (no `entryId`); `pipelineId` identifies the template
 * the operation acted on and `details` carries kind-specific context.
 *
 * Three kinds mirror the three mutating verbs:
 *
 *   - `pipeline-create` — a new pipeline template was written to
 *                         `<projectRoot>/.deskwork/pipelines/<id>.json`.
 *   - `pipeline-update` — an existing project-override pipeline was
 *                         mutated (stage added / renamed / removed,
 *                         lockedStages or offPipelineStages replaced).
 *                         The `operation` discriminator names which of
 *                         the five mutation flavors ran, with shape-
 *                         specific `before` / `after` fields.
 *   - `pipeline-delete` — a project-override pipeline JSON was deleted
 *                         from disk. `reassignedLanes` carries the
 *                         list of lane ids that were re-bound (empty
 *                         when no lanes referenced the template).
 *
 * Plugin presets are read-only — none of these events fire against
 * the packaged defaults; the mutating verbs refuse with a "create a
 * project override first" error before reaching the journal append.
 */
const PipelineCreateEvent = z.object({
  kind: z.literal('pipeline-create'),
  at: z.string().datetime(),
  pipelineId: z.string().min(1),
  details: z.object({
    name: z.string().min(1),
    linearStages: z.array(z.string().min(1)).min(1),
    lockedStages: z.array(z.string().min(1)),
    offPipelineStages: z.array(z.string().min(1)),
  }),
});

const PipelineUpdateAddStage = z.object({
  operation: z.literal('add-stage'),
  stage: z.string().min(1),
  position: z.number().int().nonnegative(),
});

const PipelineUpdateRenameStage = z.object({
  operation: z.literal('rename-stage'),
  from: z.string().min(1),
  to: z.string().min(1),
});

const PipelineUpdateRemoveStage = z.object({
  operation: z.literal('remove-stage'),
  stage: z.string().min(1),
});

const PipelineUpdateSetLocked = z.object({
  operation: z.literal('set-locked'),
  before: z.array(z.string().min(1)),
  after: z.array(z.string().min(1)),
});

const PipelineUpdateSetOffPipeline = z.object({
  operation: z.literal('set-off-pipeline'),
  before: z.array(z.string().min(1)),
  after: z.array(z.string().min(1)),
});

const PipelineUpdateEvent = z.object({
  kind: z.literal('pipeline-update'),
  at: z.string().datetime(),
  pipelineId: z.string().min(1),
  details: z.discriminatedUnion('operation', [
    PipelineUpdateAddStage,
    PipelineUpdateRenameStage,
    PipelineUpdateRemoveStage,
    PipelineUpdateSetLocked,
    PipelineUpdateSetOffPipeline,
  ]),
});

const PipelineDeleteEvent = z.object({
  kind: z.literal('pipeline-delete'),
  at: z.string().datetime(),
  pipelineId: z.string().min(1),
  details: z.object({
    purgedPath: z.string().min(1),
    reassignedLanes: z.array(z.object({
      laneId: z.string().min(1),
      from: z.string().min(1),
      to: z.string().min(1),
    })),
  }),
});

/**
 * Phase 7 Task 7.2 (graphical-entries): group-lifecycle events emitted
 * by the `/deskwork:group` verb family. Each event carries `entryId`
 * (the group's UUID — groups are themselves entries) and a per-kind
 * `details` payload.
 *
 * The six kinds mirror the six mutating verbs that operate on
 * groups specifically (cancel uses the universal `stage-transition`
 * event — `/deskwork:cancel` is a universal verb, see DESKWORK-STATE-
 * MACHINE.md Commandment II):
 *
 *   - `group-create`        — a new group entry was created.
 *   - `group-update`        — group metadata (title) was mutated.
 *   - `group-add-member`    — a member UUID was appended (or inserted
 *                             at an explicit index) to `members[]`.
 *   - `group-remove-member` — a member UUID was removed from `members[]`.
 *   - `group-archive`       — `archivedAt` was set on the group entry.
 *   - `group-restore`       — `archivedAt` was cleared.
 *
 * Group `cancel` propagation (`--cascade`) emits one
 * `stage-transition` event per affected entry (including the group
 * itself) per the universal-cancel verb's event shape. Per Step
 * 7.2.8 (graphical-entries, #359), each cascaded member's event
 * carries `metadata.cascadeFrom` set to the originating (top-level)
 * group's UUID — see `StageTransitionEvent` above for the field's
 * full contract. The originator's own event omits the field. The
 * cancel-time stdout JSON result's `cascadedMembers[]` /
 * `skippedMembers[]` arrays remain the canonical per-invocation
 * summary; the per-event `cascadeFrom` is the durable journal-level
 * back-link an auditor can grep for after the operator's terminal
 * scrollback is gone.
 */
const GroupCreateEvent = z.object({
  kind: z.literal('group-create'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  details: z.object({
    slug: z.string().min(1),
    lane: z.string().min(1),
    artifactPath: z.string().optional(),
  }),
});

const GroupUpdateEvent = z.object({
  kind: z.literal('group-update'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  details: z.object({
    changedFields: z.array(z.string().min(1)).min(1),
    before: z.record(z.string(), z.unknown()),
    after: z.record(z.string(), z.unknown()),
  }),
});

const GroupAddMemberEvent = z.object({
  kind: z.literal('group-add-member'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  details: z.object({
    memberId: z.string().uuid(),
    memberSlug: z.string().min(1),
    index: z.number().int().nonnegative(),
    membersAfter: z.array(z.string().uuid()),
  }),
});

const GroupRemoveMemberEvent = z.object({
  kind: z.literal('group-remove-member'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  details: z.object({
    memberId: z.string().uuid(),
    memberSlug: z.string().min(1),
    membersAfter: z.array(z.string().uuid()),
  }),
});

const GroupArchiveEvent = z.object({
  kind: z.literal('group-archive'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  details: z.object({
    archivedAt: z.string().datetime(),
  }),
});

const GroupRestoreEvent = z.object({
  kind: z.literal('group-restore'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
});

export const JournalEventSchema = z.discriminatedUnion('kind', [
  EntryCreatedEvent,
  EntryIngestedEvent,
  IterationEvent,
  AnnotationEvent,
  ReviewStateChangeEvent,
  StageTransitionEvent,
  EntryAnnotationEvent,
  LaneMigrationEvent,
  LaneCreateEvent,
  LaneUpdateEvent,
  LaneArchiveEvent,
  LaneRestoreEvent,
  LanePurgeEvent,
  LaneMoveEvent,
  LaneConfigRepairEvent,
  PipelineCreateEvent,
  PipelineUpdateEvent,
  PipelineDeleteEvent,
  GroupCreateEvent,
  GroupUpdateEvent,
  GroupAddMemberEvent,
  GroupRemoveMemberEvent,
  GroupArchiveEvent,
  GroupRestoreEvent,
]);

export type JournalEvent = z.infer<typeof JournalEventSchema>;
