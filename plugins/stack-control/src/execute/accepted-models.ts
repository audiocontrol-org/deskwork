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

// 035 T002/T006 — declared capability ranking (data-model.md D3, FR-004a).
//
// A DECLARED deterministic ordering, capability-ascending (index 0 = least
// capable). This is NOT an absolute-capability claim about `fable` relative
// to `opus` — it is a fixed, documented tie-break so bucket-binding (cheapest
// / mid / most-capable) is total and deterministic for any tier_map. Most
// tier_maps bind only haiku/sonnet/opus, so fable's exact rank rarely binds
// a bucket in practice, but it must still be defined for determinism.
//
// Membership MUST equal ACCEPTED_MODELS exactly (enforced by a RED test) so
// the two never drift.
export const MODEL_CAPABILITY_RANK: readonly string[] = ['haiku', 'sonnet', 'opus', 'fable'];

/**
 * The 0-based index of `model` in `MODEL_CAPABILITY_RANK`.
 *
 * A model absent from the ranking is a programming error — it would already
 * have failed `ACCEPTED_MODELS` validation upstream — so this fails loud
 * (Principle V) rather than silently placing it.
 */
export function rankOf(model: string): number {
  const rank = MODEL_CAPABILITY_RANK.indexOf(model);
  if (rank === -1) {
    throw new Error(
      `rankOf: "${model}" is not an accepted model (${ACCEPTED_MODELS_LABEL}); it has no capability rank`,
    );
  }
  return rank;
}
