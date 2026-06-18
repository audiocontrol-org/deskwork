// 026 T004 — the capability registry: the single declarative source for the
// stack-control agent-facing capability API (data-model § CapabilityRegistry,
// contracts/registry-schema.md). ONE module, three consumers (the mediate-check
// decision, redirect rendering, agent-facing discovery) — mirroring house-rules.ts
// (one source / many consumers → non-drift). It branches on capability/identity,
// never vendor identity (Principle III). Adding a backend is a registry entry, not
// new adapter code (FR-011). Generalizes refusal.ts's WRAPPED_SKILLS + frontDoorsFor.

/** The precise backend identities for one capability, split by interception surface. */
export interface BackendIdentity {
  /** Exact Skill-tool skill names refused when invoked raw (membership match, D4). */
  readonly skills: readonly string[];
  /** Normalized argv[0] identities refused when invoked raw via Bash (D4). */
  readonly cliArgv0: readonly string[];
}

/** The unit the complete-mediation invariant quantifies over. */
export interface Capability {
  /** Unique kebab id, e.g. `spec-execution`. */
  readonly id: string;
  /** The sanctioned front-door skill(s); named in the redirect message. Non-empty. */
  readonly interface: readonly string[];
  /** The identities the interceptor refuses when unmarked. */
  readonly backendIdentities: BackendIdentity;
  /** Human-readable mediation policies the front door applies; discovery only. */
  readonly policies: readonly string[];
  /** Refusal message naming the interface; derived from `interface` if absent. */
  readonly redirect?: string;
}

/** The single declarative source (data-model § CapabilityRegistry). */
export interface CapabilityRegistry {
  /** Registry version id, e.g. `stack-control-capabilities-v1`. */
  readonly id: string;
  readonly capabilities: readonly Capability[];
}

/** Which interception surface an identity arrived on (data-model § InterceptedInvocation). */
export type Surface = 'bash' | 'skill';

/**
 * The v1 capability set (registry-schema.md § v1 contents; resolves spec FR-017).
 * scope-discovery / audit-barrage / roadmap are operator tools OUTSIDE the v1
 * invariant — addable later as entries with zero interceptor-code change.
 */
export const CAPABILITY_REGISTRY: CapabilityRegistry = {
  id: 'stack-control-capabilities-v1',
  capabilities: [
    {
      id: 'backlog',
      interface: ['stack-control:backlog'],
      backendIdentities: { skills: [], cliArgv0: ['backlog'] },
      policies: ['dedup by ref', 'deskwork.* namespacing', 'capture-not-scope routing'],
    },
    {
      id: 'spec-definition',
      interface: ['stack-control:define', 'stack-control:extend'],
      backendIdentities: {
        skills: [
          'speckit-specify',
          'speckit-clarify',
          'speckit-plan',
          'speckit-checklist',
          'speckit-tasks',
          'speckit-analyze',
        ],
        cliArgv0: [],
      },
      policies: ['capture-over-YAGNI', 'design-to-spec gate', 'spec authored in chain order'],
    },
    {
      id: 'spec-execution',
      interface: ['stack-control:execute'],
      backendIdentities: { skills: ['speckit-implement'], cliArgv0: [] },
      policies: ['per-phase governance', 'commit + push at each phase boundary'],
    },
  ],
};

/** Discovery consumer (T020): the capabilities, read from the single source. */
export function listCapabilities(registry: CapabilityRegistry): readonly Capability[] {
  return registry.capabilities;
}

/** The registry identities for a surface: skills for `skill`, cliArgv0 for `bash`. */
function identitiesForSurface(cap: Capability, surface: Surface): readonly string[] {
  return surface === 'skill' ? cap.backendIdentities.skills : cap.backendIdentities.cliArgv0;
}

/**
 * Decision consumer (T010): the capability that owns `identity` on `surface`, or
 * `null` when the identity is not a fronted backend (→ permit). Exact membership
 * (no substring), mirroring isWrappedSkill (D4).
 */
export function findCapabilityByIdentity(
  registry: CapabilityRegistry,
  surface: Surface,
  identity: string,
): Capability | null {
  for (const cap of registry.capabilities) {
    if (identitiesForSurface(cap, surface).includes(identity)) return cap;
  }
  return null;
}

/** The redirect message naming a capability's interface (derived if not explicit). */
export function redirectFor(cap: Capability): string {
  if (cap.redirect !== undefined) return cap.redirect;
  if (cap.interface.length === 0) {
    throw new Error(`capability '${cap.id}' has an empty interface — cannot derive a redirect message`);
  }
  const doors = cap.interface.map((d) => `/${d}`).join(' or ');
  return (
    `Direct invocation of this backend is not the sanctioned path — it reaches around the ` +
    `stack-control '${cap.id}' capability interface. Use ${doors} instead; the interface ` +
    `mediates every call (it drives the backend in order, holds the gates, and applies the ` +
    `capability's policies). An interface you can reach around is not an interface.`
  );
}

/**
 * Validate the registry's invariants (registry-schema.md § Invariants). Returns
 * the list of violations — empty means valid. Pure; used by the consistency test
 * (T003) and available to any consumer that wants to fail loud on a bad registry.
 */
export function validateRegistry(registry: CapabilityRegistry): string[] {
  const violations: string[] = [];
  const seenIds = new Set<string>();
  const skillOwner = new Map<string, string>();
  const argv0Owner = new Map<string, string>();
  const interfaceOwner = new Map<string, string>();

  for (const cap of registry.capabilities) {
    if (seenIds.has(cap.id)) violations.push(`duplicate capability id '${cap.id}'`);
    seenIds.add(cap.id);

    if (cap.interface.length === 0) violations.push(`capability '${cap.id}' has an empty interface`);
    for (const door of cap.interface) {
      const prior = interfaceOwner.get(door);
      if (prior !== undefined) violations.push(`interface '${door}' shared by '${prior}' and '${cap.id}'`);
      else interfaceOwner.set(door, cap.id);
    }
    const unionSize = cap.backendIdentities.skills.length + cap.backendIdentities.cliArgv0.length;
    if (unionSize === 0) violations.push(`capability '${cap.id}' has an empty backend-identity union`);

    for (const skill of cap.backendIdentities.skills) {
      const prior = skillOwner.get(skill);
      if (prior !== undefined) violations.push(`skill identity '${skill}' shared by '${prior}' and '${cap.id}'`);
      else skillOwner.set(skill, cap.id);
    }
    for (const argv0 of cap.backendIdentities.cliArgv0) {
      const prior = argv0Owner.get(argv0);
      if (prior !== undefined) violations.push(`cli identity '${argv0}' shared by '${prior}' and '${cap.id}'`);
      else argv0Owner.set(argv0, cap.id);
    }
  }
  return violations;
}
