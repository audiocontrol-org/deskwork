// 028 US3 (AUDIT-BARRAGE-codex-01 / claude-01) — the LIVE derivation of an intercepted
// op's mediation class (FR-050). `decideMediation` gates ONLY mutation; a read-only fronted
// query (e.g. `backlog list`) is exempt. But the class must be DERIVED at the point of
// interception — the read-only exemption was dead code until both live callers
// (mediate-check, intercept) passed a class. This module is that single, tested source the
// two callers share, so the exemption holds end-to-end, not just in the unit test.
//
// Derivation (data-model §1, command-surface mediationClass is the declared source —
// Decision 4, never inferred):
//   * surface 'bash', fronted backend whose SUB-ACTION resolves to a command-surface
//     sub-action → that sub-action's declared mediationClass.
//   * surface 'skill' → 'mutating' (a write-bearing authoring/execution backend never
//     silently inherits read-only; the skill backends front mutating spec drives).
//   * the sub-action cannot be resolved (missing / unknown verb or sub-action) → 'mutating'
//     (fail safe — a write path must never be mis-classified read-only, Decision 4).

import { buildCommandSurface } from '../cli-help/command-surface.js';
import { matchCapability, resolvedCommandsOf } from './identity.js';
import type { OpMediationClass } from './mediate.js';
import { CAPABILITY_REGISTRY, type Surface } from './registry.js';

/** Look up the declared mediation class for `<verb> <subAction>` in the command surface,
 *  or null when the verb / sub-action is not a declared multi-action sub-action. Reads the
 *  surface (the single declared source — Decision 4), never hard-codes a class. */
function declaredClassFor(verb: string, subAction: string): OpMediationClass | null {
  for (const descriptor of buildCommandSurface()) {
    if (descriptor.verb !== verb) continue;
    for (const sub of descriptor.subActions) {
      if (sub.name === subAction) return sub.mediationClass;
    }
    return null; // the verb matched but the sub-action is unknown
  }
  return null; // no such verb in the surface
}

/**
 * The mediation class of the op identified by (`surface`, `identity`). Mutating by default
 * — only a fronted bash backend whose sub-action is DECLARED read-only in the command
 * surface yields 'read-only' (FR-050). A non-backend identity, a skill backend, or an
 * unresolvable sub-action is treated as mutating (fail safe).
 */
export function mediationClassForIdentity(surface: Surface, identity: string): OpMediationClass {
  if (surface === 'skill') return 'mutating';

  const cap = matchCapability(CAPABILITY_REGISTRY, surface, identity);
  if (cap === null) return 'mutating'; // not a fronted backend — the class is moot; stay safe

  // Find the simple command whose argv0 is one of this capability's fronted cli identities,
  // then read its sub-action. The capability's cli identity == the command-surface verb
  // (e.g. `backlog`), so the verb lookup uses that same token.
  const cliIdentities = new Set(cap.backendIdentities.cliArgv0);
  for (const command of resolvedCommandsOf(identity)) {
    if (!cliIdentities.has(command.argv0)) continue;
    if (command.subAction === null) return 'mutating'; // bare verb, no sub-action → mutating
    const declared = declaredClassFor(command.argv0, command.subAction);
    return declared ?? 'mutating';
  }
  return 'mutating';
}
