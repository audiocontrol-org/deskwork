import { z } from 'zod';

export const AnnotationSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('comment'),
  range: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }),
  text: z.string(),
  category: z.string().optional(),
  anchor: z.string().optional(),
  disposition: z.enum(['addressed', 'deferred', 'wontfix']).optional(),
  dispositionReason: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type Annotation = z.infer<typeof AnnotationSchema>;
