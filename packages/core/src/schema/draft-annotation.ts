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

/**
 * Phase 8 Step 8.1.1 — spatial anchor for graphical-entry comments.
 * Mirror of {@link import('../review/types.ts').SpatialAnchor}.
 *
 * Three `kind`s — `pixel`, `dom-selector`, `svg-element` — capture
 * which surface the anchor lives on. All position fields are optional
 * at the schema level (the renderer enforces the right combination
 * per `kind`). Adding `kind` values requires updating both this
 * schema and the TS interface in lockstep.
 */
const SpatialAnchorSchema = z.object({
  kind: z.enum(['pixel', 'dom-selector', 'svg-element']),
  selector: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
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
  // Phase 8 Step 8.1.1 — additive fields. Existing single-comment
  // annotations without any of these continue to parse unchanged.
  // The TS source-of-truth lives at `review/types.ts:CommentAnnotation`.
  replyTo: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  spatialAnchor: SpatialAnchorSchema.optional(),
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

const EditCommentAnnotation = z.object({
  ...BaseFields,
  type: z.literal('edit-comment'),
  commentId: z.string(),
  text: z.string().optional(),
  range: RangeSchema.optional(),
  category: AnnotationCategoryEnum.optional(),
  anchor: z.string().optional(),
});

const DeleteCommentAnnotation = z.object({
  ...BaseFields,
  type: z.literal('delete-comment'),
  commentId: z.string(),
});

const ArchiveCommentAnnotation = z.object({
  ...BaseFields,
  type: z.literal('archive-comment'),
  commentId: z.string(),
  priorStage: z.string().optional(),
});

export const DraftAnnotationSchema = z.discriminatedUnion('type', [
  CommentAnnotation,
  EditAnnotation,
  ApproveAnnotation,
  RejectAnnotation,
  ResolveAnnotation,
  AddressAnnotation,
  EditCommentAnnotation,
  DeleteCommentAnnotation,
  ArchiveCommentAnnotation,
]);
