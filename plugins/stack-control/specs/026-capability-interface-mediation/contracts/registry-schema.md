# Contract: Capability registry schema

**Feature**: 026-capability-interface-mediation. The single declarative source (`src/capability/registry.ts`), mirroring the `house-rules.ts` one-source/many-consumers precedent. TypeScript module, not config — strict-typed, committed, reviewable.

## Type shape

```ts
interface BackendIdentity {
  skills: readonly string[];    // exact Skill-tool skill names (membership match)
  cliArgv0: readonly string[];  // normalized argv[0] identities (membership match)
}

interface Capability {
  id: string;                   // unique kebab id
  interface: readonly string[]; // sanctioned front-door skill(s)
  backendIdentities: BackendIdentity;
  policies: readonly string[];  // human-readable mediation policies (discovery only)
  redirect?: string;            // refusal message; derived from `interface` if absent
}

interface CapabilityRegistry {
  id: string;                   // e.g. 'stack-control-capabilities-v1'
  capabilities: readonly Capability[];
}
```

## v1 contents (resolves spec FR-017)

| id | interface | skills | cliArgv0 | policies |
|---|---|---|---|---|
| `backlog` | `stack-control:backlog` | — | `backlog` | dedup; `deskwork.*` namespacing; routing |
| `spec-definition` | `stack-control:define`, `stack-control:extend` | `speckit-specify`, `speckit-clarify`, `speckit-plan`, `speckit-checklist`, `speckit-tasks`, `speckit-analyze` | — | capture-over-YAGNI; design gate |
| `spec-execution` | `stack-control:execute` | `speckit-implement` | — | per-phase governance |

**Excluded at v1** (operator tools outside the invariant; addable later as entries, zero interceptor change): `scope-discovery`, `audit-barrage`, `roadmap`.

## Invariants (validated by a registry-consistency test)

- `id` unique across capabilities.
- No backend identity (skill or argv0) appears in two capabilities.
- Every capability has a non-empty `interface` and a non-empty identity union.
- The set the interceptor refuses == the set discovery lists (house-rules non-drift; one test asserts both consumers read the same source).

## Migration note

`refusal.ts`'s `WRAPPED_SKILLS` + `frontDoorsFor()` collapse into the `spec-definition` + `spec-execution` entries. `speckit-guard` becomes a thin caller of `mediate-check` (or is retired in favor of it), preserving its exit-code contract. The env-var `STACKCTL_FRONT_DOOR` check migrates to the marker-file mechanism (research D1).
