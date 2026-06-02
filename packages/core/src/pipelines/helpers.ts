/**
 * Template-aware pipeline helpers (Phase 4 Task 4.1).
 *
 * The editorial-narrow helpers in `../schema/entry.ts`
 * (`isLinearPipelineStage`, `isOffPipelineStage`, `nextStage`) consult
 * a hardcoded editorial-pipeline stage list. Per the graphical-entries
 * PRD and DESKWORK-STATE-MACHINE.md Commandment II, verbs are universal
 * and stage-gated only on the entry's lane template — every lane can
 * declare its own `linearStages` and `offPipelineStages`.
 *
 * The helpers below are the template-driven equivalents. They accept a
 * resolved `PipelineTemplate` (the loader's return type — `.strict()`
 * schema means the inferred type lists exactly the declared keys) plus
 * a stage string, and answer the membership / successor question
 * relative to THAT template's vocabulary. The legacy editorial-narrow
 * helpers remain in `../schema/entry.ts` for the migration window and
 * are marked `@deprecated`; new code should use these.
 *
 * Design:
 *
 *   - Pure functions. No I/O, no template loading. Callers pass the
 *     resolved template (see `../lanes/resolve.ts` for the lane → entry
 *     → template lookup that produces the input).
 *
 *   - No fallbacks. A stage that is neither in `linearStages` nor in
 *     `offPipelineStages` is genuinely unknown to the template; the
 *     `assert` helper throws with the full allowed list so the operator
 *     sees both the offending stage and the template's vocabulary.
 *
 *   - `nextStageInTemplate` returns `null` (rather than throwing) when
 *     the entry sits at the terminal linear stage (the last entry in
 *     `linearStages` — `Published` in editorial, `Shipped` in visual,
 *     etc.). This mirrors the editorial-narrow `nextStage(s)` shape so
 *     verb code branches uniformly.
 */

import type { PipelineTemplate } from './types.ts';

/**
 * True when `stage` is one of the template's linear-pipeline stages.
 * The linear stages are the ordered forward-progress stages — verbs
 * like `approve` move an entry through this list in order.
 */
export function isLinearPipelineStageInTemplate(
  template: PipelineTemplate,
  stage: string,
): boolean {
  return template.linearStages.includes(stage);
}

/**
 * True when `stage` is one of the template's off-pipeline (cul-de-sac)
 * stages. Off-pipeline stages are the "exit the linear flow" stages —
 * `cancel` / `block` move entries here; `induct` brings them back into
 * the linear flow.
 */
export function isOffPipelineStageInTemplate(
  template: PipelineTemplate,
  stage: string,
): boolean {
  return template.offPipelineStages.includes(stage);
}

/**
 * True when `stage` is in the template's `lockedStages` list. Locked
 * stages refuse `iterate` — the pre-publication review-freeze stage
 * (`Final` in editorial, `Approved` in visual) gates iterate so the
 * content can't change while awaiting publish.
 */
export function isLockedStageInTemplate(
  template: PipelineTemplate,
  stage: string,
): boolean {
  return template.lockedStages?.includes(stage) ?? false;
}

/**
 * True when `stage` is recognized by the template — either linear or
 * off-pipeline. Used to validate sidecar stage strings at verb-call
 * time before any state mutation.
 */
export function isKnownStageInTemplate(
  template: PipelineTemplate,
  stage: string,
): boolean {
  return (
    isLinearPipelineStageInTemplate(template, stage)
    || isOffPipelineStageInTemplate(template, stage)
  );
}

/**
 * The linear successor of `stage` within `template.linearStages`.
 * Returns `null` when `stage` is the last entry in `linearStages`
 * (terminal — used by `publish`, not `approve`).
 *
 * Throws when `stage` is not in `linearStages` (e.g. an off-pipeline
 * stage or an unknown stage). Callers that need to handle the off-
 * pipeline case should consult `isOffPipelineStageInTemplate` first.
 */
export function nextStageInTemplate(
  template: PipelineTemplate,
  stage: string,
): string | null {
  const idx = template.linearStages.indexOf(stage);
  if (idx === -1) {
    throw new Error(
      `nextStageInTemplate: stage "${stage}" is not in template "${template.id}".linearStages. ` +
        `Allowed linear stages: ${template.linearStages.join(', ')}. ` +
        `If the stage is off-pipeline (Blocked / Cancelled / etc.), ` +
        `the caller should branch via isOffPipelineStageInTemplate before calling nextStageInTemplate.`,
    );
  }
  if (idx === template.linearStages.length - 1) {
    // Terminal linear stage — no successor (use `publish`, not `approve`).
    return null;
  }
  return template.linearStages[idx + 1];
}

/**
 * Assert that `stage` is a recognized stage in the template; throw a
 * descriptive error otherwise. Used by every verb to validate the
 * entry's `currentStage` before any state mutation.
 */
export function assertStageInTemplate(
  template: PipelineTemplate,
  stage: string,
  context: string,
): void {
  if (!isKnownStageInTemplate(template, stage)) {
    const allowed = [
      ...template.linearStages,
      ...template.offPipelineStages,
    ].join(', ');
    throw new Error(
      `${context}: stage "${stage}" is not in pipeline template "${template.id}". ` +
        `Allowed stages (linear + off-pipeline): ${allowed}. ` +
        `Either fix the entry's currentStage, or extend the template's stage list.`,
    );
  }
}

/**
 * Return the terminal linear stage of `template` — the last entry in
 * `linearStages`. The terminal stage is the publish target; entries
 * graduate to it via `publish`, not `approve`.
 */
export function terminalLinearStage(template: PipelineTemplate): string {
  // The schema guarantees `linearStages` is non-empty.
  return template.linearStages[template.linearStages.length - 1];
}

/**
 * Return the pre-terminal stage — the stage from which `publish`
 * graduates an entry to the terminal stage. Returns `null` when the
 * template has only one linear stage (no pre-terminal position).
 *
 * For editorial: `terminalLinearStage` is `Published`; this returns
 * `Final`. For visual: terminal is `Shipped`; this returns `Approved`.
 */
export function preTerminalLinearStage(
  template: PipelineTemplate,
): string | null {
  if (template.linearStages.length < 2) return null;
  return template.linearStages[template.linearStages.length - 2];
}
