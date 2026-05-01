import { z } from 'zod';
import { EntrySchema } from './entry.ts';
import { AnnotationSchema } from './annotation.ts';

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

export const JournalEventSchema = z.discriminatedUnion('kind', [
  EntryCreatedEvent,
  EntryIngestedEvent,
  IterationEvent,
  AnnotationEvent,
  ReviewStateChangeEvent,
  StageTransitionEvent,
]);

export type JournalEvent = z.infer<typeof JournalEventSchema>;
