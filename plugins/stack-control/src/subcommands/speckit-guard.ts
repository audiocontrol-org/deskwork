// `stackctl speckit-guard <skill-name>` (025 US4 — the portable refusal verb).
//
// DEPRECATED (026 T017): superseded by the capability interceptor (`bin/intercept` +
// `stackctl mediate-check`), which refuses a raw backend at the point of invocation and
// reads the session-keyed marker FILE. This verb is kept (frozen) per the documented-
// subcommand contract; its skill→front-door mapping now DERIVES from the capability
// registry (via refusal.ts), so there is one source. New adapters call `mediate-check`.
//
// BEHAVIORAL NOTE (026 T017, audit claude-07): because the mapping is now registry-derived,
// this verb's refusal SET widened from the original four (025) to the seven speckit skills
// the registry fronts — it now ALSO refuses a direct `speckit-clarify`/`speckit-checklist`/
// `speckit-analyze` (correctly: those are fronted by /stack-control:define|extend, a 025
// gap). The exit-code contract (0/1/2) is unchanged; only the membership widened.
//
// DIVERGENCE NOTE (026 T017, audit claude-04): this verb resolves "via front door" from
// the legacy ENV marker (`STACKCTL_FRONT_DOOR === '1'`), while the 026 interceptor resolves
// it from the session-keyed marker FILE. A context established via `front-door enter` (file)
// is therefore NOT seen here — a `speckit-guard` call after a file-marker `enter` would
// refuse. This is a deprecation artifact (the interceptor is the live path); reconciling the
// frozen verb's decision to read the same file marker is tracked as TASK-165.
//
// The cross-vendor surface for the speckit wrapper: given a backend skill identity, it
// refuses a DIRECT invocation and names the sanctioned stack-control front door, or
// permits an invocation reached via its front door (the FRONT_DOOR_MARKER_ENV marker is
// set). Behavior lives here in `stackctl` (specs/017 Decision 1); the plugin's
// cross-vendor command/skill adapters call it. It patches nothing it does not ship — the
// US1 per-phase graduate gate is the real defense-in-depth (FR-014).
//
// Exit: 0 permitted (front-door / not a wrapped skill); 1 refused (direct invocation of a
// wrapped skill); 2 usage error.

import {
  FRONT_DOOR_MARKER_ENV,
  evaluateRefusal,
  isWrappedSkill,
} from '../speckit-wrapper/refusal.js';

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

  // A non-wrapped skill is not this verb's concern → permit (exit 0).
  if (!isWrappedSkill(skill)) {
    process.stdout.write(`speckit-guard: '${skill}' is not a wrapped backend skill — permitted.\n`);
    return;
  }

  const viaFrontDoor = process.env[FRONT_DOOR_MARKER_ENV] === '1';
  const verdict = evaluateRefusal(skill, viaFrontDoor);
  if (verdict.refused) {
    process.stderr.write(`speckit-guard: REFUSED — ${verdict.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`speckit-guard: ${verdict.message}\n`);
}
