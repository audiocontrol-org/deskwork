# Phase 1 Data Model: Capability-interface mediation

**Feature**: 026-capability-interface-mediation · **Date**: 2026-06-17

Entities are the in-`stackctl` (vendor-neutral) types plus the on-disk marker. No database — the registry is a TypeScript module; the marker is a JSON file. Types follow Constitution Principle VI (strict typing, composition; no `any`/`as`).

## Capability

The unit the complete-mediation invariant quantifies over.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` (kebab) | `backlog` · `spec-definition` · `spec-execution` (v1). Unique. |
| `interface` | `string[]` | The sanctioned front-door skill(s), e.g. `['stack-control:execute']`. Named in redirect messages. Non-empty. |
| `backendIdentities` | `BackendIdentity` | The identities the interceptor refuses when unmarked (below). |
| `policies` | `string[]` | Human-readable mediation policies this capability's front door applies (e.g. `per-phase governance`, `capture-over-YAGNI`). Discovery surfaces these; not executed by the interceptor. |
| `redirect` | `string` | The message template naming the interface to use on refusal. Derived from `interface` if omitted. |

**Validation**: `id` unique across the registry; `interface` non-empty; at least one non-empty `backendIdentities` set.

## BackendIdentity

The precise identities for one capability's backend, split by surface.

| Field | Type | Notes |
|---|---|---|
| `skills` | `string[]` | Exact skill names refused when invoked raw via the `Skill` tool, e.g. `['speckit-implement']`. Matched by exact membership (D4). |
| `cliArgv0` | `string[]` | Normalized executable identities refused when invoked raw via `Bash`, e.g. `['backlog']`. Matched against normalized `argv[0]` (D4). |

**Validation**: union of `skills` ∪ `cliArgv0` is non-empty; no identity appears in two capabilities (a backend belongs to exactly one capability).

## CapabilityRegistry

The single declarative source (D5), mirroring `house-rules.ts`. One module, three consumers.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Registry version id, e.g. `stack-control-capabilities-v1`. |
| `capabilities` | `Capability[]` | The v1 set. |

**Consumers** (derived, never cloned): `mediate-check` decision · redirect rendering · agent-facing discovery. **Invariant**: the interceptor refuses exactly the identities discovery lists (house-rules non-drift).

## FrontDoorMarker (on disk)

The session-scoped sanction signal (D1). Path: `<installation>/.stack-control/state/front-door/<session_id>.json`.

| Field | Type | Notes |
|---|---|---|
| `sessionId` | `string` | From the hook stdin payload; keys the file. |
| `active` | `ActiveEntry[]` | Stack of active front-door entries (supports nesting/concurrency — FR-014a). |
| (`ActiveEntry`)`.capability` | `string` | Capability id being driven. |
| (`ActiveEntry`)`.token` | `string` | Unique per-entry token; teardown removes its own entry only (no cross-clear). |
| (`ActiveEntry`)`.writtenAt` | ISO `string` | Staleness bound: entries older than a max-session-age are ignored on read. |

**Lifecycle**: front-door skill `enter` → push an `ActiveEntry`; `exit` → pop by `token`. Read by the interceptor: marker grants permit iff an un-stale `ActiveEntry` exists for the invoked capability. Empty `active` (or no file) → unmarked → refuse on a backend identity.

**State transitions**:
```
(no file / empty active)  --enter(cap)-->  active=[…,{cap}]   (marked for cap)
active=[…,{cap,token}]     --exit(token)--> active=[…]          (entry removed)
any                        --stale prune--> drop entries older than max age
```

## InterceptedInvocation (transient, per hook call)

What the adapter passes to `mediate-check`.

| Field | Type | Notes |
|---|---|---|
| `surface` | `'bash' \| 'skill'` | Which matcher fired. |
| `identity` | `string` | Normalized `argv[0]` (bash) or skill name (skill). |
| `sessionId` | `string` | From hook payload. |
| `cwd` | `string` | From hook payload; resolves the enclosing installation. |

## MediationDecision (transient, verb result)

| Field | Type | Notes |
|---|---|---|
| `verdict` | `'permit' \| 'refuse'` | Maps to exit 0 / 1; usage error → exit 2. |
| `capability` | `string \| null` | The matched capability (null when identity matched nothing → permit). |
| `reason` | `string` | On refuse: the registry-sourced redirect naming the interface. |

**Decision rule** (pure): identity ∉ any `backendIdentities` → `permit` (not a fronted backend). identity ∈ capability C's identities AND no un-stale marker entry for C → `refuse(C)`. identity ∈ C AND marker entry for C present → `permit`.

## UngovernedState (backstop — Approach C)

What the reconciler (D6) flags: backend effect present without a corresponding governance/graduation record for its capability. Reuses the existing per-phase checkpoint state (`current | missing | stale`) for `spec-execution`; generalized per capability. Shape deferred to the backstop tasks (reuses `phase-checkpoint-status.ts` types).
