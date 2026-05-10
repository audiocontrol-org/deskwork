export type Stage =
  | 'Ideas' | 'Planned' | 'Outlining' | 'Drafting' | 'Final' | 'Published'
  | 'Blocked' | 'Cancelled';

const LINEAR_PIPELINE: readonly Stage[] = ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'] as const;
const OFF_PIPELINE: readonly Stage[] = ['Blocked', 'Cancelled'] as const;

export function isLinearPipelineStage(s: Stage): boolean {
  return LINEAR_PIPELINE.includes(s);
}

export function isOffPipelineStage(s: Stage): boolean {
  return OFF_PIPELINE.includes(s);
}

const SUCCESSOR: Record<Stage, Stage | null> = {
  Ideas: 'Planned',
  Planned: 'Outlining',
  Outlining: 'Drafting',
  Drafting: 'Final',
  Final: null,        // publish, not approve
  Published: null,
  Blocked: null,
  Cancelled: null,
};

export function nextStage(s: Stage): Stage | null {
  return SUCCESSOR[s];
}

import { z } from 'zod';

const StageEnum = z.enum(['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled']);

export const EntrySchema = z.object({
  // Identity
  uuid: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  keywords: z.array(z.string()),
  source: z.string(),

  // Pipeline state
  // Per DESKWORK-STATE-MACHINE.md (Commandment III), reviewState is
  // RETIRED — no `reviewState` field exists on Entry. zod's default
  // is non-strict, so existing on-disk sidecars carrying a vestigial
  // `reviewState` key parse cleanly (the field is silently dropped on
  // read; absent on next write).
  currentStage: StageEnum,
  priorStage: StageEnum.optional(),
  iterationByStage: z.record(StageEnum, z.number().int().nonnegative()),

  // Editorial
  targetVersion: z.string().optional(),
  datePublished: z.string().datetime().optional(),

  // Explicit on-disk artifact path (relative to contentDir). Set by
  // `add` / `outline` / `induct` at creation time, and by migration's
  // ingest-journal lookup. When absent (legacy entries pre-Phase 30
  // migration data fixes), consumers fall back to the slug+stage
  // heuristic.
  artifactPath: z.string().optional(),

  // Distribution (deferred — shortform model)
  shortformWorkflows: z.record(z.string(), z.string()).optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Entry = z.infer<typeof EntrySchema>;
