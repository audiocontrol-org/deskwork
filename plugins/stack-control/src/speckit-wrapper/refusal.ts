// Speckit wrapper refusal/redirect map (025 US4) — 026 T017: now DERIVED from the
// capability registry (the single source), not a second hardcoded skill list.
//
// DEPRECATED in favor of the 026 capability interceptor (`bin/intercept` +
// `stackctl mediate-check`), which refuses a raw backend at the point of invocation and
// reads the session-keyed marker FILE (research D1). `speckit-guard` remains as a frozen
// 025 CLI verb (per the documented-subcommand contract — never removed, only superseded)
// and delegates its skill→front-door mapping here, where it derives from
// CAPABILITY_REGISTRY. The env-var marker below is the legacy 025 path; the marker-FILE
// switch (T017) is realized by the 026 interceptor, not by changing this verb's signature.

import { CAPABILITY_REGISTRY } from '../capability/registry.js';

/** The backend speckit skills the registry fronts (spec-definition + spec-execution),
 *  DERIVED from the single source — adding a skill backend to the registry extends this
 *  with no edit here (FR-011 non-drift). */
export const WRAPPED_SKILLS: readonly string[] = CAPABILITY_REGISTRY.capabilities.flatMap(
  (c) => c.backendIdentities.skills,
);

/**
 * The env marker a 025 front door set when it legitimately drove a backend skill.
 * DEPRECATED: the 026 mechanism is the session-keyed marker FILE (see `capability/marker.ts`),
 * read by the interceptor. Kept only for the frozen 025 `speckit-guard` contract.
 */
export const FRONT_DOOR_MARKER_ENV = 'STACKCTL_FRONT_DOOR';

/** True when `name` is a wrapped backend skill (registry-derived; skill identity, never vendor). */
export function isWrappedSkill(name: string): boolean {
  return WRAPPED_SKILLS.includes(name);
}

/** The sanctioned front door(s) for a wrapped skill — the interface of the registry
 *  capability that owns it. Throws if `skill` is not wrapped (callers gate with isWrappedSkill). */
export function frontDoorsFor(skill: string): readonly string[] {
  const cap = CAPABILITY_REGISTRY.capabilities.find((c) => c.backendIdentities.skills.includes(skill));
  if (cap === undefined) throw new Error(`'${skill}' is not a wrapped backend skill`);
  return cap.interface;
}

export interface RefusalVerdict {
  readonly refused: boolean;
  readonly skill: string;
  readonly frontDoors: readonly string[];
  readonly message: string;
}

/**
 * Evaluate whether a direct invocation of `skill` is refused. Direct (`viaFrontDoor ===
 * false`) → refused, message names the sanctioned front door (FR-012); front-door-marked
 * → permitted (no false positive). Pure — the caller resolves `viaFrontDoor`.
 */
export function evaluateRefusal(skill: string, viaFrontDoor: boolean): RefusalVerdict {
  const frontDoors = frontDoorsFor(skill);
  if (viaFrontDoor) {
    return {
      refused: false,
      skill,
      frontDoors,
      message: `/${skill} reached via its stack-control front door — permitted.`,
    };
  }
  const doors = frontDoors.map((d) => `/${d}`).join(' or ');
  return {
    refused: true,
    skill,
    frontDoors,
    message:
      `Direct invocation of /${skill} is not the sanctioned path. Use ${doors} instead — ` +
      `the stack-control front door drives the backend in order, holds the gates, and runs ` +
      `per-phase governance. (An evaded raw path still cannot graduate without per-phase ` +
      `checkpoints — the US1 gate, FR-014.)`,
  };
}
