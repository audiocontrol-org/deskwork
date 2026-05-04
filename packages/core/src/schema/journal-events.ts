import { z } from 'zod';
import { EntrySchema } from './entry.ts';
import { AnnotationSchema } from './annotation.ts';
import { DraftAnnotationSchema } from './draft-annotation.ts';

const StageEnum = z.enum(['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled']);
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
  targetStage: StageEnum,
});

const IterationEvent = z.object({
  kind: z.literal('iteration'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  stage: StageEnum,
  version: z.number().int().positive(),
  markdown: z.string(),
});

const AnnotationEvent = z.object({
  kind: z.literal('annotation'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  stage: StageEnum,
  version: z.number().int().positive(),
  annotation: AnnotationSchema,
});

const ReviewStateChangeEvent = z.object({
  kind: z.literal('review-state-change'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  stage: StageEnum,
  from: ReviewStateEnum.nullable(),
  to: ReviewStateEnum.nullable(),
});

const StageTransitionEvent = z.object({
  kind: z.literal('stage-transition'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  from: StageEnum,
  to: StageEnum,
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

export const JournalEventSchema = z.discriminatedUnion('kind', [
  EntryCreatedEvent,
  EntryIngestedEvent,
  IterationEvent,
  AnnotationEvent,
  ReviewStateChangeEvent,
  StageTransitionEvent,
  EntryAnnotationEvent,
]);

export type JournalEvent = z.infer<typeof JournalEventSchema>;
