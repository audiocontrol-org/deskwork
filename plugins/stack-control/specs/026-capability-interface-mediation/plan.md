# Implementation Plan: Capability-interface mediation — the stack-control agent-facing API

**Branch**: `feature/stack-control` (program long-lived branch; numbered spec dir) | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/026-capability-interface-mediation/spec.md`

## Summary

stack-control becomes the agent-facing API whose capability interfaces *completely mediate* access to swappable backends. A single declarative **capability registry** (in vendor-neutral `stackctl`) drives one **PreToolUse interceptor** (plugin-shipped, two matchers: `Bash` + `Skill`) that refuses any raw fronted-backend call lacking a **front-door marker file**, naming the interface to use; sanctioned front-door skills bracket their backend drive with `front-door enter/exit` so the same call passes. A generalized graduate gate + reconciler is the layered backstop. The technical approach is grounded in the existing 025 `speckit-guard`/`refusal.ts`, the `house-rules.ts` single-source pattern, and the `all-phase-checkpoints-current` gate (see [research.md](./research.md)).

## Technical Context

**Language/Version**: TypeScript (strict), run via `tsx` (no `ts-node`); Node — matches the existing `plugins/stack-control` in-tree runtime.

**Primary Dependencies**: existing `stackctl` source (`src/cli.ts` dispatch, `src/speckit-wrapper/refusal.ts`, `src/workflow/`, `src/govern/`); Claude Code plugin hooks (`hooks/hooks.json` + a `bin/intercept` `tsx` adapter); vitest. No new third-party runtime deps.

**Storage**: capability registry = a committed TS module (`src/capability/registry.ts`); front-door marker = a session-keyed JSON file under `<installation>/.stack-control/state/front-door/<session_id>.json` (atomic temp-write+rename, mirroring existing checkpoint I/O). No database.

**Testing**: vitest — unit (registry consistency, decision rule, argv0 normalization, marker lifecycle) + integration (verb end-to-end against tmp installations) + the installation-isolation probe inherits the new state-writing verbs. In-session hook behavior (Scenario F/H) is manual/integration against an installed plugin.

**Target Platform**: Claude Code (primary — full `Bash`+`Skill` interception); Codex (partial — Bash-only, sequenced as the US4 follow-on). Decision core is vendor-neutral `stackctl`.

**Project Type**: single project (CLI + plugin), extending the existing `plugins/stack-control` tree.

**Performance Goals**: the hook fires on EVERY `Bash`/`Skill` tool call. Measurable budget: a NON-matching call MUST short-circuit in the adapter WITHOUT spawning `stackctl` (pure in-process pre-filter — target < 5 ms added overhead); only a registry-matching identity spawns `mediate-check`, whose decision is a small registry lookup + one marker-file read (target < 50 ms). These bound the per-tool-call tax the interceptor adds.

**Constraints**: cross-vendor (decision logic in `stackctl`, branch on capability/identity never vendor — Principle III); must not edit the adopter's backend files (Principle IV); enforcement travels with `claude plugin install` (no git hook — ADR ruling, spec Decision 5); installation-anchor invariant for all marker writes; `STACKCTL_FRONT_DOOR` migrates env→file.

**Scale/Scope**: 3 capabilities at v1; small registry; single-session marker state; ~4 new verbs + 1 registry module + 1 hook adapter + the env→file migration of the existing guard.

## Constitution Check

*GATE: re-checked after Phase 1 design — PASS, no violations, Complexity Tracking empty.*

| Principle | Status | How this plan satisfies it |
|---|---|---|
| I — Test-First | PASS | The only spike (D3, the undocumented `Skill` `tool_input` field) is explicitly throwaway; the interceptor + every verb are built RED-first in vitest. |
| II — Integration-First | PASS | The registry is derived from TWO real instances already flowing through the codebase (the speckit skills via `refusal.ts`; the `backlog` CLI), not an imagined provider. The single-source shape copies `house-rules.ts`. |
| III — Capability, not vendor | PASS | All decision logic in `stackctl mediate-check`; the Claude/Codex adapters are thin marshallers; the registry keys on capability/identity, never vendor. |
| IV — Division of labor | PASS | The mediation layer never writes the adopter's backend artifacts; the marker is stack-control-owned state; `mediate-check` is a pure read. |
| V — No fallbacks | PASS | "Identity not in registry → permit" is correct (not a fronted backend), not a fallback; a malformed registry / unreadable marker on a KNOWN identity fails loud rather than silent-permitting. |
| VI — Strict typing & composition | PASS | New modules are small, composed, interface-typed; no `any`/`as`/`@ts-ignore`; each file under the 300–500 cap (registry, decision, each verb, adapter are separate modules). |
| VII — Commit & push early | PASS | One logical change per commit, pushed at task boundaries. |
| VIII — Faithful tool adoption | PASS | This spec is itself being authored through the full Spec Kit chain in order. |
| IX — Execution-backend pluggability | PASS | Consistent with the axis split: this feature mediates agent→backend access by capability; backend selection stays capability-keyed. |
| Installation-anchor invariant | PASS | `front-door enter/exit` and any state write anchor in the nearest-enclosing (or `--at`) installation; refuse loudly with none. The isolation probe covers the new verbs. |

## Project Structure

### Documentation (this feature)

```text
specs/026-capability-interface-mediation/
├── plan.md              # This file
├── spec.md              # /speckit-specify + /speckit-clarify output
├── research.md          # Phase 0 — decisions D1–D8, grounded in real instances
├── data-model.md        # Phase 1 — entities
├── quickstart.md        # Phase 1 — runnable refuse/permit validation (SC-001…007)
├── contracts/           # Phase 1 — cli-verbs, interceptor-hook, registry-schema
└── tasks.md             # Phase 2 — /speckit-tasks output (NOT created here)
```

### Source Code (repository root = plugins/stack-control)

```text
src/
├── capability/
│   ├── registry.ts            # NEW — the single declarative source (D5); v1: backlog, spec-definition, spec-execution
│   ├── identity.ts            # NEW — argv0 normalization + skill-name membership (D4)
│   └── mediate.ts             # NEW — pure decision rule (registry + marker → MediationDecision)
├── capability/marker.ts        # NEW — front-door marker file I/O (enter/exit/read, atomic, session-keyed, stale-prune) (D1)
├── subcommands/
│   ├── mediate-check.ts       # NEW — the decision verb both adapters call (generalizes speckit-guard) (D7)
│   ├── front-door.ts          # NEW — `front-door enter|exit` marker writer verbs
│   ├── capability.ts          # NEW — `capability list` discovery + `capability reconcile` backstop (D6)
│   └── speckit-guard.ts       # MIGRATE — env→file marker; thin caller of mediate-check (or retire)
├── speckit-wrapper/refusal.ts  # MIGRATE — WRAPPED_SKILLS/frontDoorsFor fold into the registry
└── cli.ts                      # EDIT — register the new verbs in SUBCOMMANDS

hooks/
└── hooks.json                  # NEW — PreToolUse for Bash + Skill matchers (plugin-shipped)
bin/
└── intercept                   # NEW — tsx adapter: payload → mediate-check → permissionDecision (D7, contracts/interceptor-hook.md)

src/__tests__/
├── capability/
│   ├── registry.test.ts       # registry invariants + house-rules non-drift (one source, two consumers)
│   ├── identity.test.ts       # argv0 normalization + false-positive collision set (SC-003)
│   ├── mediate.test.ts        # decision rule truth table (permit/refuse/marker)
│   └── marker.test.ts         # marker lifecycle: enter/exit/nesting/staleness (FR-014a)
├── subcommands/
│   ├── mediate-check.test.ts  # verb exit codes 0/1/2 + redirect message
│   ├── front-door.test.ts     # writer verbs + atomicity
│   └── capability.test.ts     # list + reconcile
└── installation-isolation-probe.test.ts  # EXTEND — new state-writing verbs honor the anchor invariant
```

**Structure Decision**: extend the existing single `plugins/stack-control` project. New code is grouped under `src/capability/` (the registry + pure logic), with the marker I/O and verbs alongside existing peers, and the Claude adapter under the plugin's `hooks/` + `bin/`. This keeps every file within the 300–500-line cap and mirrors existing module boundaries (`workflow/`, `govern/`).

## Phase sequencing (informs /speckit-tasks)

1. **Spike (throwaway, D3)** — confirm the `Skill` `tool_input` field empirically; discard. Gate for the `Skill` matcher.
2. **Registry + pure logic** (`registry.ts`, `identity.ts`, `mediate.ts`) — RED-first; the decision rule + argv0 + membership. No I/O.
3. **Marker I/O** (`marker.ts` + `front-door` verbs) — lifecycle, atomicity, staleness, isolation-probe coverage.
4. **Decision verb** (`mediate-check`) + migrate `speckit-guard`/`refusal.ts` to the registry + env→file marker.
5. **Discovery + reconciler** (`capability list` / `reconcile`) — backstop.
6. **Claude adapter** (`hooks.json` + `bin/intercept`) — payload mapping; manual Scenario F/H verification.
7. **Codex adapter** — sequenced follow-on (US4); Bash-only.

## Complexity Tracking

*No Constitution violations — table intentionally empty.*

## Post-Design Constitution Re-check

Re-evaluated after Phase 1 (data-model + contracts + quickstart): no new violations introduced; the design stayed within the existing module conventions and the capability/identity-not-vendor rule. PASS.
