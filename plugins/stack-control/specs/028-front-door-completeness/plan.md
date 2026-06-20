# Implementation Plan: Front-Door Completeness

**Branch**: `028-front-door-completeness` (program convention: one long-lived branch; spec dir resolved via CLAUDE.md SPECKIT markers, TF-09) | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/028-front-door-completeness/spec.md`; approved design record `docs/superpowers/specs/2026-06-19-front-door-completeness-design.md`.

## Summary

Make the entire stack-control front door complete, discoverable, and governed now that 026 teeth forbid reaching around it. The load-bearing technical approach (settled in the design record): the **commander command tree is the single source of truth** for the command surface; `--help`, the auto-generated verb reference, the generated descriptor artifact, the fronted-operations registry, and the `check-front-door` guardrail all **derive** from it. The 027 work already proved the pattern on `roadmap`/`govern` via `src/cli-help/command-adapter.ts` — this feature **generalizes that adapter to all 46 verbs** and builds the derived registry + guardrail on top, fills the missing operation verbs (as sub-actions of existing skills), and hardens the 026 teeth so they never over-refuse or wedge a session.

## Technical Context

**Language/Version**: TypeScript (strict; no `any`/`as Type`/`@ts-ignore`), run via `tsx`; Node.

**Primary Dependencies**: `commander` (the CLI parser → the descriptor source); the existing stackctl core (`src/cli.ts` dispatcher, `src/cli-help/` help adapter, `src/capability/` mediation, `src/roadmap/`, `src/backlog/`, `src/workflow/`).

**Storage**: governed markdown (`ROADMAP.md`; backlog task files); YAML (`.stack-control/config.yaml`, mediation markers). No DB.

**Testing**: `vitest`; RED-first per Constitution I. Gates are **local pre-PR smokes + skill-body gates** — NO test infrastructure in CI (project rule).

**Target Platform**: Node CLI + Claude Code / Codex plugin (portability targets per FR-006/007).

**Project Type**: single-project CLI / plugin.

**Performance Goals**: `--help` returns effectively instantly; the 026 interceptor per-invocation cold-start (FR-025/TASK-191) must not regress and should improve.

**Constraints**: files under 300–500 lines (decompose); enforcement lives in skill bodies + CLI verbs, never git hooks; no fallbacks/mock data outside tests (throw on missing); the generated descriptor artifact is derived, never authored (FR-041).

**Scale/Scope**: 46 verbs, 34 skills, all four workstreams in one feature (operator mandate — no scope cuts).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First (NON-NEGOTIABLE)** — PASS. Every new verb and `check-front-door` itself ships RED-first; FR-033 mandates RED tests proving the guardrail fails on deleted-skill / broken-help / unfronted-verb; FR-052 mandates a round-trip test for the descriptor artifact; FR-035 a smoke proving the interceptor loads.
- **II. Integration-First, No Speculative Building** — PASS. Extends shipped 026 (mediation) + 027 (`command-adapter`) infrastructure; builds nothing speculative. The registry/guardrail derive from the real command tree.
- **III. Branch on Capabilities, Never Provider Identity** — PASS. Mediation keys on capability + installation scope (FR-020), never vendor; the descriptor is parser-agnostic in contract (commander is the impl, not the contract).
- **IV. Division of Labor** — PASS. Authoring (this orchestrator session) is separate from implementation (a later impl session); `define` ≠ `setup`.
- **V. No Fallbacks, No Mock Data Outside Tests** — PASS. Missing skill/verb/help → `check-front-door` throws/exits non-zero; no silent default.
- **VI. Strict Typing & Composition** — PASS. The descriptor + registry are typed; composition over inheritance; new files kept under cap (pre-existing `govern.ts` 958-line debt is TASK-151, not introduced here).
- **VII. Commit & Push Early and Often** — PASS. Per-task commits + push.
- **VIII. Faithful Tool Adoption** — PASS. This plan was produced by the full speckit chain in order.
- **IX. Execution-Backend Pluggability** — N/A (no execution-backend surface in this feature).

**No violations → Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/028-front-door-completeness/
├── plan.md              # This file
├── research.md          # Phase 0 — key technical decisions
├── data-model.md        # Phase 1 — descriptor, registry, marker, terminal-state entities
├── quickstart.md        # Phase 1 — runnable validation mapped to SC-001..007
├── contracts/           # Phase 1 — check-front-door, registry schema, new verb contracts, --help contract, descriptor artifact
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (installation root: `plugins/stack-control/`)

```text
src/
├── cli.ts                       # dispatcher — every verb routed through the shared command surface
├── cli-help/
│   ├── command-adapter.ts       # EXISTING (027) descriptor/help adapter — GENERALIZE to all 46 verbs
│   ├── command-surface.ts       # NEW — the single command-tree descriptor (one def per verb/sub-action)
│   └── verb-reference.ts        # NEW — auto-generated verb reference + descriptor-artifact emitter (FR-004/052)
├── capability/
│   ├── registry.ts              # EXISTING — CAPABILITY_REGISTRY (skill-declared capability ids; FR-051 source)
│   ├── mediate.ts               # EXISTING — extend: read-only exemption (FR-050), installation-scoped short-circuit-to-permit (FR-020)
│   ├── marker.ts                # EXISTING — session+install-keyed marker; add listMarker/clearMarker for recovery (FR-021/022/023)
│   ├── intercept.ts             # EXISTING — bin/intercept entry; fail-open observable + cold-start (FR-025)
│   └── fronted-operations.ts    # NEW — registry DERIVED from command surface + CAPABILITY_REGISTRY (FR-030/051)
├── subcommands/
│   ├── check-front-door.ts      # NEW — the guardrail verb (FR-031)
│   ├── front-door.ts            # EXISTING — add reset / mediate-recover / mediate-list (FR-021/022)
│   ├── backlog.ts (+ backlog/)  # add done/archive/unpromote; capture slug+dedupe (FR-010..013)
│   ├── roadmap.ts (+ roadmap/)  # add add-edge/remove-edge/move-edge/rename/remove-node; reconcile --unorphan; approve-design (FR-014..016); edge-aware archival (FR-017)
│   └── speckit-guard.ts         # reconcile to the file marker (FR-024)
├── roadmap/                     # roadmap-model + edge mutation engine
├── backlog/                     # backlog store adapter + terminal disposition
└── __tests__/                   # vitest — RED-first for every verb + check-front-door + interceptor smoke

skills/                          # SKILL.md accuracy sweep (FR-005); new /stack-control:check-front-door skill (FR-032)
hooks/hooks.json                 # ensure registered in plugin manifest + smoke (FR-035)
```

**Structure Decision**: single-project CLI. The spine is `src/cli-help/command-surface.ts` (the generalized descriptor) from which `--help`, the verb reference, the descriptor artifact, and `src/capability/fronted-operations.ts` (the registry) all derive; `src/subcommands/check-front-door.ts` reads the registry to enforce the invariant.

## Phasing (maps to the four user stories; US1 is foundational)

The descriptor is built first because the registry and guardrail derive from it; but all four ship in one feature, ratcheted by `check-front-door` so partial progress cannot regress (the feature is "done" only when SC-001..007 all hold).

- **Phase A — US1 Discoverability spine (foundational).** Generalize `command-adapter` into `command-surface.ts`; migrate all 46 verbs onto it family-by-family; `--help` for every verb + sub-action (FR-001/002/003); auto-generated verb reference + the generated descriptor artifact with round-trip test (FR-004/052); SKILL.md accuracy sweep + discovery-output fixes (FR-005/006/007).
- **Phase B — US2 Operation set.** backlog done/archive/unpromote + capture slug/dedupe (FR-010..013); roadmap edge mutation + reconcile --unorphan + approve-design verb (FR-014..016); edge-aware archival + close-related re-point (FR-017/018). Each new sub-action lands on the Phase-A surface (so it is born discoverable).
- **Phase C — US3 Teeth recovery.** installation-scoped mediation + read-only exemption (FR-020/050); recovery verbs front-door reset / mediate-recover / mediate-list (FR-021/022); session-bound markers + linchpin reconciliation (FR-023); speckit-guard file-marker reconcile (FR-024); fail-open signalling + staleness + cold-start (FR-025/026).
- **Phase D — US4 Guardrail.** fronted-operations registry derived from surface + skill declarations (FR-030/051); `check-front-door` four-assertion verb + doctor rule + skill (FR-031/032); RED tests for the three regression cases (FR-033); wire into session-start/implement/review (FR-034); interceptor-loaded smoke (FR-035).

## Complexity Tracking

*No Constitution Check violations — section intentionally empty.*
