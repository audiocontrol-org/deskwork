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

const StageTransitionEvent = z.object({
  kind: z.literal('stage-transition'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  from: StageStringSchema,
  to: StageStringSchema,
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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

export const JournalEventSchema = z.discriminatedUnion('kind', [
  EntryCreatedEvent,
  EntryIngestedEvent,
  IterationEvent,
  AnnotationEvent,
  ReviewStateChangeEvent,
  StageTransitionEvent,
  EntryAnnotationEvent,
  LaneMigrationEvent,
]);

export type JournalEvent = z.infer<typeof JournalEventSchema>;
