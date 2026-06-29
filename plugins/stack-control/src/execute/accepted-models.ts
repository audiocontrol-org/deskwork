// 033 T008 — the accepted-model-set capability constant (research D4).
//
// The SINGLE source of the host's subagent model vocabulary — a DISPATCH-SURFACE
// capability, not a tier-map concept and not a vendor identity (Principle III/IX).
// The tier-map validator (config-loader) and tier resolution both consult this set;
// nothing else in the feature names a concrete model. A second host (e.g. Codex)
// contributes its own accepted-model set behind this same seam (D4 open consideration)
// — built when that concrete instance exists, not designed speculatively now.
//
// Today's instance: the Claude Code subagent surface accepts haiku | sonnet | opus |
// fable (the Agent/Task dispatch's model selector). Order in ACCEPTED_MODELS_LABEL is
// capability-tier ascending so error messages read naturally.

/** The Claude Code subagent dispatch surface's accepted model keywords (D4). */
export const ACCEPTED_MODELS: ReadonlySet<string> = new Set(['haiku', 'sonnet', 'opus', 'fable']);

/** Pipe-joined accepted-model list for fail-loud error messages
 *  (`… is not an accepted model (haiku|sonnet|opus|fable)`). */
export const ACCEPTED_MODELS_LABEL = 'haiku|sonnet|opus|fable';

/** Is `value` a model keyword the dispatch surface accepts? */
export function isAcceptedModel(value: string): boolean {
  return ACCEPTED_MODELS.has(value);
}
