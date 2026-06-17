// `stackctl speckit-guard <skill-name>` (025 US4 — the portable refusal verb).
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
