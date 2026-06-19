// `stackctl speckit-guard <skill-name>` (025 US4 — the portable refusal verb).
//
// DEPRECATED (026 T017): superseded by the capability interceptor (`bin/intercept` +
// `stackctl mediate-check`), which refuses a raw backend at the point of invocation and
// reads the session-keyed marker FILE. This verb is kept (frozen) per the documented-
// subcommand contract; its skill→front-door mapping DERIVES from the capability registry
// (via refusal.ts), so there is one source. New adapters call `mediate-check`.
//
// 028 T090 (FR-024 / contract T5): this verb now resolves "via front door" from the 026
// session-keyed marker FILE (via `activeCapabilities`), NOT the legacy `STACKCTL_FRONT_DOOR`
// env var — so its decision MATCHES the interceptor (a context established via
// `front-door enter` is seen by both). This resolves the TASK-165 divergence the header
// previously documented. The env-var path is retired here.
//
// BEHAVIORAL NOTE (026 T017, audit claude-07): because the mapping is registry-derived,
// this verb's refusal SET is the seven speckit skills the registry fronts — it refuses a
// direct `speckit-clarify`/`speckit-checklist`/`speckit-analyze` (correctly: those are
// fronted by /stack-control:define|extend, a 025 gap). The widened set is JUSTIFIED: each
// is a state-bearing spec-authoring backend the `define`/`extend` front doors mediate;
// refusing the raw call is the correct, not over-broad, behavior. The exit-code contract
// (0/1/2) is unchanged; only the membership widened (audited per T5).
//
// Exit: 0 permitted (front-door / not a wrapped skill); 1 refused (direct invocation of a
// wrapped skill); 2 usage error.

import { activeCapabilities, isSafeSession } from '../capability/marker.js';
import { CAPABILITY_REGISTRY } from '../capability/registry.js';
import { findInstallation } from '../config/installation.js';
import { evaluateRefusal, isWrappedSkill, type RefusalVerdict } from '../speckit-wrapper/refusal.js';

/** The capability id that fronts a wrapped speckit skill (the registry capability whose
 *  `backendIdentities.skills` includes it), or null when `skill` is not wrapped. */
function capabilityForSkill(skill: string): string | null {
  for (const cap of CAPABILITY_REGISTRY.capabilities) {
    if (cap.backendIdentities.skills.includes(skill)) return cap.id;
  }
  return null;
}

/**
 * Resolve "via front door" from the 026 session-keyed marker FILE (T090 / FR-024). True
 * when the enclosing installation's marker for `session` has an ACTIVE entry for the
 * capability that fronts `skill` — exactly the signal the interceptor reads. With no
 * enclosing installation, or no marker, the answer is false (a direct invocation). Never
 * throws on a missing installation/marker (it is a probe).
 */
export function resolveViaFrontDoorFile(skill: string, session: string, cwd: string): boolean {
  const capability = capabilityForSkill(skill);
  if (capability === null) return false; // not a wrapped skill — caller gates with isWrappedSkill
  // An empty or UNSAFE (path-traversal) session id cannot key a marker the interceptor ever
  // wrote — treat it as "no front-door context" rather than letting markerPath's
  // assertSafeSession throw an unhandled rejection in the async verb (claude-04). A
  // compromised $CLAUDE_CODE_SESSION_ID therefore yields the normal refusal path, never a
  // crash with a non-contract exit code.
  if (!isSafeSession(session)) return false;
  const installation = findInstallation(cwd);
  if (installation === null) return false;
  return activeCapabilities(installation.root, session).has(capability);
}

/**
 * Pure decision core: a non-wrapped skill permits; a wrapped skill is refused unless
 * `viaFrontDoor` (resolved from the file marker). Hermetically testable — the caller
 * resolves `viaFrontDoor`.
 */
export function evaluateGuard(skill: string, viaFrontDoor: boolean): RefusalVerdict {
  if (!isWrappedSkill(skill)) {
    return {
      refused: false,
      skill,
      frontDoors: [],
      message: `'${skill}' is not a wrapped backend skill — permitted.`,
    };
  }
  return evaluateRefusal(skill, viaFrontDoor);
}

function parseArgs(args: string[]): { skill: string } {
  let skill: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined) continue;
    if (token.startsWith('--')) {
      process.stderr.write(`speckit-guard: unexpected flag '${token}' (usage: speckit-guard <skill-name>)\n`);
      process.exit(2);
    }
    if (skill !== undefined) {
      process.stderr.write(`speckit-guard: unexpected extra argument '${token}'\n`);
      process.exit(2);
    }
    skill = token;
  }
  if (skill === undefined) {
    process.stderr.write('speckit-guard: <skill-name> required (e.g. speckit-implement)\n');
    process.exit(2);
  }
  return { skill };
}

export async function runSpeckitGuard(args: string[]): Promise<void> {
  const { skill } = parseArgs(args);

  // Resolve "via front door" from the 026 file marker (T090), keyed by the session id the
  // interceptor reads ($CLAUDE_CODE_SESSION_ID) + the enclosing installation — so this
  // verb and the interceptor agree on a `front-door enter`-established context.
  // `resolveViaFrontDoorFile` is defensive against an empty / unsafe (path-traversal)
  // session id — it returns false rather than throwing (claude-04) — so a compromised
  // $CLAUDE_CODE_SESSION_ID yields the normal refusal path, never an unhandled rejection.
  const session = process.env.CLAUDE_CODE_SESSION_ID ?? '';
  const viaFrontDoor = resolveViaFrontDoorFile(skill, session, process.cwd());

  const verdict = evaluateGuard(skill, viaFrontDoor);
  if (verdict.refused) {
    process.stderr.write(`speckit-guard: REFUSED — ${verdict.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`speckit-guard: ${verdict.message}\n`);
}
