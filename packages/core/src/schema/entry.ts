/**
 * Entry schema — the on-disk sidecar contract.
 *
 * Phase 3 (graphical-entries) migration-window state:
 *
 *   - `currentStage` was historically a hardcoded `StageEnum` covering
 *     the eight pre-feature editorial stages. Per the graphical-entries
 *     PRD and DESKWORK-STATE-MACHINE.md Commandment II (verbs are
 *     universal and stage-gated only), stages now come from the lane's
 *     pipeline template — every lane can declare its own
 *     `linearStages` and `offPipelineStages`. The schema therefore
 *     accepts ANY non-empty string for `currentStage`, `priorStage`,
 *     and `iterationByStage` keys. Runtime validation that the stage
 *     belongs to the entry's lane template is the caller's job, not
 *     the schema's — see the Phase 4 verb-routing work for the
 *     template-aware check.
 *
 *   - `lane` and `artifactKind` are NEW fields (Phase 3 Task 3.2).
 *     Both are OPTIONAL during the migration window so existing
 *     sidecars parse cleanly; doctor's lane-migration step (later
 *     phase) back-fills them and then doctor enforces their presence.
 *     The Zod-level optionality is intentional and explicit — we do
 *     NOT want a read-side error to fire on legacy sidecars during
 *     the rollout.
 *
 *   - The legacy `StageEnum` export stays as a back-compat read alias.
 *     Editorial-default fast paths (calendar render, doctor heuristics
 *     for the pre-feature editorial pipeline) may still depend on the
 *     eight-stage shape; Phase 4's verb code will introduce the
 *     template-driven generic API. Do NOT delete `StageEnum`,
 *     `isLinearPipelineStage`, `isOffPipelineStage`, or `nextStage`
 *     — they're load-bearing for the editorial lane until Phase 4
 *     replaces them lane-by-lane.
 *
 *   - Per DESKWORK-STATE-MACHINE.md Commandment III, `reviewState` is
 *     RETIRED. No `reviewState` field exists on Entry. Zod's default
 *     is non-strict, so existing on-disk sidecars carrying a vestigial
 *     `reviewState` key parse cleanly (the field is silently dropped
 *     on read; absent on next write).
 *
 *   - See `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md`
 *     Phase 3 for the migration plan; Phase 4 tightens the verb-side
 *     reads.
 */

export type Stage =
  | 'Ideas' | 'Planned' | 'Outlining' | 'Drafting' | 'Final' | 'Published'
  | 'Blocked' | 'Cancelled';

const LINEAR_PIPELINE: readonly Stage[] = ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'] as const;
const OFF_PIPELINE: readonly Stage[] = ['Blocked', 'Cancelled'] as const;

/**
 * Editorial-default helpers. Per Phase 3 (graphical-entries) the
 * sidecar's `currentStage` is now a plain string (lane-template-
 * driven), so these helpers accept `string` rather than the narrow
 * `Stage` union — callers can pass an `Entry.currentStage` without
 * narrowing first. The semantic question being answered is
 * "is this stage one of the editorial lane's linear / off-pipeline
 * stages?" — a non-editorial stage name returns false. Phase 4's
 * lane-aware helpers replace these with template-driven equivalents.
 */
export function isLinearPipelineStage(s: string): boolean {
  return (LINEAR_PIPELINE as readonly string[]).includes(s);
}

export function isOffPipelineStage(s: string): boolean {
  return (OFF_PIPELINE as readonly string[]).includes(s);
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

/**
 * Editorial-default successor lookup. Per Phase 3 the input is widened
 * to `string` (lane-template-driven `currentStage` values); inputs
 * outside the editorial pipeline's eight known stages return `null`
 * rather than throwing — callers handle the "no successor" case
 * already, and Phase 4 introduces a lane-template-driven successor
 * API that supersedes this editorial-only helper.
 */
export function nextStage(s: string): Stage | null {
  if (
    s === 'Ideas' || s === 'Planned' || s === 'Outlining' || s === 'Drafting'
    || s === 'Final' || s === 'Published' || s === 'Blocked' || s === 'Cancelled'
  ) {
    return SUCCESSOR[s];
  }
  return null;
}

import { z } from 'zod';

/**
 * Editorial-pipeline stage enum — kept as a back-compat export. New
 * code that needs to validate a stage against an arbitrary lane
 * template should use the template's `linearStages ∪
 * offPipelineStages` set instead; see Phase 4. The enum continues to
 * surface in the editorial-default fast paths until those are
 * lane-aware.
 */
export const StageEnum = z.enum(['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled']);

/**
 * Per Phase 3 Task 3.2.2: a stage on the sidecar is now any non-empty
 * string (validated against the lane's template at runtime, not at
 * the schema layer).
 */
const StageStringSchema = z.string().min(1, 'stage must be a non-empty string');

/**
 * Per Phase 3 Task 3.2.1: `artifactKind` is the four-case enum
 * detection.ts produces. Optional during the migration window;
 * doctor enforces presence after migration.
 */
const ArtifactKindEnum = z.enum(['markdown', 'html-mockup', 'single-file-html', 'image']);

export const EntrySchema = z.object({
  // Identity
  uuid: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  keywords: z.array(z.string()),
  source: z.string(),

  // Pipeline state
  // Per Phase 3 Task 3.2.2: currentStage / priorStage are
  // template-validated at runtime, schema-validated only as
  // non-empty strings. iterationByStage keys are likewise any
  // non-empty string.
  // Per DESKWORK-STATE-MACHINE.md (Commandment III), reviewState is
  // RETIRED — no `reviewState` field exists on Entry. Zod's default
  // is non-strict, so existing on-disk sidecars carrying a vestigial
  // `reviewState` key parse cleanly (the field is silently dropped
  // on read; absent on next write).
  currentStage: StageStringSchema,
  priorStage: StageStringSchema.optional(),
  iterationByStage: z.record(StageStringSchema, z.number().int().nonnegative()),

  // Lane membership (Phase 3 Task 3.2.1). Optional during the
  // migration window; doctor's lane-migration step back-fills the
  // field and then doctor enforces presence. Identifies the
  // `.deskwork/lanes/<lane>.json` config the entry lives under.
  lane: z.string().min(1).optional(),

  // Artifact-kind classification (Phase 3 Task 3.2.1). Optional
  // during the migration window for the same reason. Mirrors the
  // four-case detection in `lanes/detection.ts`.
  artifactKind: ArtifactKindEnum.optional(),

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
