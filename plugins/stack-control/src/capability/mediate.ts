// 026 T010 — the pure mediation decision (data-model § MediationDecision). Given the
// registry, the intercepted surface + identity, and the resolved set of active
// front-door capabilities, decide permit/refuse. Pure and read-only (Principle IV):
// it takes the active-capabilities set as input — it does NOT read the marker file or
// any disk state, so it is trivially testable and side-effect-free. The verb
// (mediate-check) resolves the marker → active set and calls this.

import { matchCapability } from './identity.js';
import { redirectFor, type CapabilityRegistry, type Surface } from './registry.js';

/** Whether an intercepted op is state-bearing (mediated) or a pure query (exempt).
 *  Mirrors `cli-help/command-surface.ts`'s `MediationClass` (FR-050). */
export type OpMediationClass = 'mutating' | 'read-only';

/** The decision (data-model § MediationDecision). `verdict` maps to verb exit 0/1. */
export interface MediationDecision {
  readonly verdict: 'permit' | 'refuse';
  /** The matched capability id, or null when the identity is not a fronted backend. */
  readonly capability: string | null;
  /** On refuse: the registry-sourced redirect naming the interface. */
  readonly reason: string;
}

/**
 * Decide whether an intercepted invocation is permitted. The rule (data-model):
 *   identity ∉ any backend            → permit (not fronted)
 *   identity ∈ C, op is read-only     → permit (mediation gates ONLY mutation — FR-050)
 *   identity ∈ C, no marker for C     → refuse(C)  (mutating fronted calls)
 *   identity ∈ C, marker for C active → permit (sanctioned via the front door)
 *
 * `mediationClass` defaults to `'mutating'` (back-compat: a fronted op is mediated unless
 * declared read-only — a write path can never silently inherit "read-only", Decision 4).
 */
export function decideMediation(
  registry: CapabilityRegistry,
  surface: Surface,
  identity: string,
  activeCapabilities: ReadonlySet<string>,
  mediationClass: OpMediationClass = 'mutating',
): MediationDecision {
  const cap = matchCapability(registry, surface, identity);
  if (cap === null) {
    return { verdict: 'permit', capability: null, reason: 'not a fronted backend' };
  }
  // Read-only exemption (FR-050): mediation gates only mutation/state-bearing ops. A
  // read-only query is never refused, even inside an installation with no marker.
  if (mediationClass === 'read-only') {
    return {
      verdict: 'permit',
      capability: cap.id,
      reason: `read-only '${cap.id}' query — mediation-exempt (FR-050)`,
    };
  }
  if (activeCapabilities.has(cap.id)) {
    return {
      verdict: 'permit',
      capability: cap.id,
      reason: `reached via the stack-control '${cap.id}' front door — permitted`,
    };
  }
  return { verdict: 'refuse', capability: cap.id, reason: redirectFor(cap) };
}
