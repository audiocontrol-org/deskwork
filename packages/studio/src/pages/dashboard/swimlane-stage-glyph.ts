/**
 * Stage glyph lookup for the multi-lane swimlane renderer.
 *
 * Pipeline templates declare stage names as plain strings; the visual
 * language assigns a press-check glyph per stage. The legacy
 * editorial vocabulary's glyphs (◇ Ideas, § Planned, ⊹ Outlining,
 * ✎ Drafting, ※ Final, ✓ Published, ⊘ Blocked, ✗ Cancelled) are the
 * primary set the operator already recognizes. Lane templates that
 * introduce new stage names (Sketched, Reviewed, Tested, etc.) get a
 * default glyph (◦) until the design archive documents a stage→glyph
 * mapping for each new template.
 *
 * Per the project's `Just for now is bullshit` rule, the default
 * glyph is NOT a placeholder for "we'll pick a real glyph later" —
 * it's the documented behavior: stages outside the editorial
 * vocabulary use the neutral ◦ until a deliberate design decision
 * adds an entry to this table.
 */

const STAGE_GLYPHS: Record<string, string> = {
  // Editorial pipeline
  Ideas: '◇',
  Planned: '§',
  Outlining: '⊹',
  Drafting: '✎',
  Final: '※',
  Published: '✓',
  // Off-pipeline (editorial)
  Blocked: '⊘',
  Cancelled: '✗',
  Archived: '⊠',
  // Visual pipeline (per packages/core/src/pipelines/visual.json)
  Sketched: '◇',
  Iterating: '✎',
  Approved: '✓',
  Shipped: '※',
  // QA-plan pipeline (per packages/core/src/pipelines/qa-plan.json)
  Drafted: '✎',
  Reviewed: '⌕',
  Tested: '⊛',
  // "Approved" already covered above (shared name with visual).
};

/**
 * Glyph indicating an off-pipeline stage when no specific glyph
 * is mapped. Renderers can pass this as the `fallback` when calling
 * `stageGlyph` for off-pipeline stages to keep the neutral signal
 * distinct from linear-pipeline neutrals.
 */
export const GLYPH_OFF = '⊘';

/**
 * Default neutral glyph for stages outside the documented vocabulary.
 * Distinct from `GLYPH_OFF` so a renderer can express "I don't have
 * a glyph for this linear stage" vs. "this is off-pipeline neutral."
 */
export const GLYPH_DEFAULT = '◦';

/**
 * Look up the press-check glyph for a stage name. Pass `GLYPH_OFF`
 * as the fallback to mark off-pipeline neutrals.
 */
export function stageGlyph(
  stage: string,
  fallback: string = GLYPH_DEFAULT,
): string {
  return STAGE_GLYPHS[stage] ?? fallback;
}
