// Speckit wrapper refusal/redirect map (025 US4 — corrected mechanism, operator
// decision 2026-06-16).
//
// A PORTABLE, pure map from a wrapped backend speckit skill identity to its sanctioned
// stack-control front door. It branches on SKILL IDENTITY, never vendor identity
// (Principle III), and lives in `stackctl` — the authoritative cross-vendor surface
// (specs/017 Decision 1) — exposed through the plugin's own cross-vendor command/skill
// adapters. It does NOT patch the adopter's own backend speckit skills (those are the
// adopter's Spec Kit, not plugin-controlled) and uses no Claude-only `.claude/skills`
// path (GitHub #480). The US1 per-phase graduate gate is the real defense-in-depth: an
// evaded raw backend path cannot graduate without per-phase checkpoints (FR-014). A
// cross-vendor point-of-invocation interception of a *raw* call is the filed follow-on
// `design:gap/speckit-bypass-point-of-invocation-refusal`, not 025's scope.

/** The backend speckit skills every stack-control front door wraps (FR-012). */
export const WRAPPED_SKILLS = [
  'speckit-specify',
  'speckit-plan',
  'speckit-tasks',
  'speckit-implement',
] as const;
export type WrappedSkill = (typeof WRAPPED_SKILLS)[number];

/**
 * The env marker a stack-control front door sets when it legitimately drives a backend
 * skill, so the wrapper does not refuse a sanctioned invocation. The CLI verb reads it;
 * the pure `evaluateRefusal` takes the resolved boolean (no ambient state in the core).
 */
export const FRONT_DOOR_MARKER_ENV = 'STACKCTL_FRONT_DOOR';

const AUTHORING_FRONT_DOORS = ['stack-control:define', 'stack-control:extend'] as const;
const IMPLEMENT_FRONT_DOOR = ['stack-control:execute'] as const;

/** True when `name` is one of the wrapped backend skills (skill identity, never vendor). */
export function isWrappedSkill(name: string): name is WrappedSkill {
  return (WRAPPED_SKILLS as readonly string[]).includes(name);
}

/** The sanctioned front door(s) for a wrapped skill: authoring → define/extend; implement → execute. */
export function frontDoorsFor(skill: WrappedSkill): readonly string[] {
  return skill === 'speckit-implement' ? IMPLEMENT_FRONT_DOOR : AUTHORING_FRONT_DOORS;
}

export interface RefusalVerdict {
  readonly refused: boolean;
  readonly skill: WrappedSkill;
  readonly frontDoors: readonly string[];
  readonly message: string;
}

/**
 * Evaluate whether a direct invocation of `skill` is refused. A direct invocation
 * (`viaFrontDoor === false`) is refused and the message names the sanctioned front
 * door (FR-012); a front-door-marked invocation (`viaFrontDoor === true`) is permitted
 * (no false positive). Pure — no ambient state.
 */
export function evaluateRefusal(skill: WrappedSkill, viaFrontDoor: boolean): RefusalVerdict {
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
