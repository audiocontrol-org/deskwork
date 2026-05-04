/**
 * Zod schema mirror of `DraftAnnotation` from `../review/types.ts`.
 *
 * The TS interface union in `review/types.ts` is the source of truth for
 * the *shape*. This file provides a runtime validator for the same shape
 * so journal events carrying a `DraftAnnotation` payload can be parsed
 * via `JournalEventSchema.safeParse` at the read boundary.
 *
 * The union variants here mirror `CommentAnnotation | EditAnnotation |
 * ApproveAnnotation | RejectAnnotation | ResolveAnnotation |
 * AddressAnnotation`. If a new variant is added there, mirror it here.
 */

import { z } from 'zod';

const AnnotationCategoryEnum = z.enum([
  'voice-drift',
  'missing-receipt',
  'tutorial-framing',
  'saas-vocabulary',
  'fake-authority',
  'structural',
  'other',
]);

const RangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

const BaseFields = {
  /** ISO-8601 timestamp when the annotation was recorded. */
  createdAt: z.string().datetime(),
  /** Workflow the annotation belongs to (legacy field; entry-keyed
   * annotations still carry it for type compatibility with the
   * workflow-keyed `DraftAnnotation` union, but the entry-store does
   * not key off it). */
  workflowId: z.string(),
  /** Server-assigned id. */
  id: z.string(),
} as const;

const CommentAnnotation = z.object({
  ...BaseFields,
  type: z.literal('comment'),
  version: z.number().int(),
  range: RangeSchema,
  text: z.string(),
  category: AnnotationCategoryEnum.optional(),
  anchor: z.string().optional(),
});

const EditAnnotation = z.object({
  ...BaseFields,
  type: z.literal('edit'),
  beforeVersion: z.number().int(),
  afterMarkdown: z.string(),
  diff: z.string(),
});

const ApproveAnnotation = z.object({
  ...BaseFields,
  type: z.literal('approve'),
  version: z.number().int(),
});

const RejectAnnotation = z.object({
  ...BaseFields,
  type: z.literal('reject'),
  version: z.number().int(),
  reason: z.string().optional(),
});

const ResolveAnnotation = z.object({
  ...BaseFields,
  type: z.literal('resolve'),
  commentId: z.string(),
  resolved: z.boolean(),
});

const AddressAnnotation = z.object({
  ...BaseFields,
  type: z.literal('address'),
  commentId: z.string(),
  version: z.number().int(),
  disposition: z.enum(['addressed', 'deferred', 'wontfix']),
  reason: z.string().optional(),
});

export const DraftAnnotationSchema = z.discriminatedUnion('type', [
  CommentAnnotation,
  EditAnnotation,
  ApproveAnnotation,
  RejectAnnotation,
  ResolveAnnotation,
  AddressAnnotation,
]);
