---
description: "Task list for capability-interface mediation"
---

# Tasks: Capability-interface mediation — the stack-control agent-facing API

**Input**: Design documents from `specs/026-capability-interface-mediation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED. Constitution Principle I (Test-First, NON-NEGOTIABLE) overrides Spec Kit's "tests optional" default — every behavior is built RED-first.

**Organization**: by user story (spec.md priorities). Paths are relative to the installation root `plugins/stack-control/`.

## Phase 1: Setup

- [ ] T001 Create the module skeleton: `src/capability/` and `src/__tests__/capability/` directories, plus a shared tmp-installation fixture helper in `src/__tests__/fixtures/capability-fixtures.ts` (mirrors existing govern fixtures).

## Phase 2: Foundational (blocking — shared by US1 + US2)

- [ ] T002 [SPIKE] Throwaway PreToolUse `Skill`-matcher probe: register a minimal hook that logs its stdin payload, invoke a skill, capture the exact `tool_input` field carrying the skill name (research D3); record the confirmed field name in `specs/026-capability-interface-mediation/research.md`; DELETE the probe. If the field is absent, stop and revisit D2/D3 (skill surface falls to backstop). Gates the `Skill` matcher in T015.
- [ ] T003 [P] Write failing tests for registry invariants in `src/__tests__/capability/registry.test.ts`: id uniqueness; no backend identity in two capabilities; non-empty interface + identity union; single-source non-drift (the set the decision reads == the set discovery lists).
- [ ] T004 Implement `src/capability/registry.ts` (the declarative `CapabilityRegistry` with v1 entries backlog / spec-definition / spec-execution per contracts/registry-schema.md) to pass T003.
- [ ] T005 [P] Write failing tests for identity matching in `src/__tests__/capability/identity.test.ts`: `argv[0]` normalization (basename, strip `env`/`sudo` wrappers); the false-positive collision set (backend name in path/arg/comment must NOT match — SC-003); exact skill-name membership.
- [ ] T006 Implement `src/capability/identity.ts` (argv0 normalization + membership helpers, research D4) to pass T005.

## Phase 3: User Story 1 — refuse raw reach-around, permit marked front-door (Priority: P1) 🎯 MVP

**Goal**: A raw fronted-backend call (Bash CLI or `/speckit-*` skill) without the marker is refused at the point of invocation, naming the interface; the same call through a front-door skill (which sets the marker) passes.

**Independent test**: quickstart Scenarios A, B, C, F — raw `backlog`/`speckit-implement` refused; bracketed by `front-door enter/exit` permitted; collision commands not refused.

- [ ] T007 [P] [US1] Write failing tests for the marker file in `src/__tests__/capability/marker.test.ts`: enter/exit by token; nested/concurrent entries isolate (one teardown can't clear another — FR-014a); staleness prune; session-keying (FR-014).
- [ ] T008 [US1] Implement `src/capability/marker.ts` (atomic session-keyed marker file under `<installation>/.stack-control/state/front-door/<session>.json`, active-entry stack, stale prune) to pass T007.
- [ ] T009 [P] [US1] Write failing tests for the pure decision rule in `src/__tests__/capability/mediate.test.ts`: permit non-backend identity; refuse backend w/o marker (reads included); permit backend w/ marker (truth table from data-model § MediationDecision).
- [ ] T010 [US1] Implement `src/capability/mediate.ts` (registry + marker → `MediationDecision`, pure/read-only) to pass T009.
- [ ] T011 [P] [US1] Write failing tests for the decision verb in `src/__tests__/subcommands/mediate-check.test.ts`: exit 0 permit / 1 refuse / 2 usage; strict flag parse (`--surface/--identity/--session/--at`); registry-sourced redirect message on stderr; `--json` shape (contracts/cli-verbs.md).
- [ ] T012 [US1] Implement `src/subcommands/mediate-check.ts` + register in `src/cli.ts` `SUBCOMMANDS` to pass T011.
- [ ] T013 [P] [US1] Write failing tests for the marker writer verbs in `src/__tests__/subcommands/front-door.test.ts`: `enter` returns a token + writes atomically; `exit` is safe after a crash (missing token = no-op success); installation-anchor refusal with no enclosing installation.
- [ ] T014 [US1] Implement `src/subcommands/front-door.ts` (`enter`/`exit`) + register in `src/cli.ts` to pass T013.
- [ ] T015 [US1] Add the Claude adapter: `hooks/hooks.json` (PreToolUse for `Bash` + `Skill`) + `bin/intercept` (tsx) mapping payload → `mediate-check` → `permissionDecision: deny`, with the cheap local pre-filter for latency (contracts/interceptor-hook.md, research D7). Uses the T002-confirmed `Skill` field.
- [ ] T016 [US1] Update the front-door skill bodies (`skills/define/SKILL.md`, `skills/extend/SKILL.md`, `skills/execute/SKILL.md`, `skills/backlog/SKILL.md`) to bracket their backend drive with `stackctl front-door enter`/`exit` so sanctioned calls carry the marker.
- [ ] T017 [US1] Migrate `src/speckit-wrapper/refusal.ts` (`WRAPPED_SKILLS`/`frontDoorsFor`) into the registry; make `src/subcommands/speckit-guard.ts` delegate to `mediate-check` (or retire it) and switch its marker check from env-var to the marker file; update `src/__tests__/speckit-wrapper/wrapper-refusal.test.ts`. Keep exit-code contract intact.
- [ ] T018 [US1] Manual integration against an installed plugin: run quickstart Scenarios A, B, C, F; record verdicts/exit codes in `quickstart.md`.

**Checkpoint**: US1 alone delivers the complete-mediation teeth for all three v1 capabilities (CLI + skill surfaces) on Claude.

## Phase 4: User Story 2 — capability registry is the single source / agent-readable API spec (Priority: P2)

**Goal**: Discovery lists each capability's interface, mediated identities, and policies from the one registry; a new backend is a registry entry, not new adapter code.

**Independent test**: quickstart Scenarios D, E.

- [ ] T019 [P] [US2] Write failing tests for discovery in `src/__tests__/subcommands/capability.test.ts`: `capability list` surfaces the 3 capabilities with interface/identities/policies; `--json` shape; reads the single registry (FR-009/010/012).
- [ ] T020 [US2] Implement `capability list` in `src/subcommands/capability.ts` + register in `src/cli.ts` to pass T019.
- [ ] T021 [US2] Manual integration: quickstart Scenarios D (add a temp registry entry → refused with no interceptor change) and E (discovery == API spec).

## Phase 5: User Story 3 — harmless-bypass backstop (Priority: P3)

**Goal**: Bypassed backend work cannot graduate, and a reconciler flags un-governed state.

**Independent test**: quickstart Scenario G.

- [ ] T022 [P] [US3] Write failing tests for `capability reconcile` in `src/__tests__/subcommands/capability-reconcile.test.ts`: flags un-governed `spec-execution` state; report-only (exit 0; no mutation).
- [ ] T023 [US3] Implement `capability reconcile` in `src/subcommands/capability.ts` reusing per-phase checkpoint status (`src/govern/phase-checkpoint-status.ts`) + register; pass T022.
- [ ] T024 [US3] Confirm/generalize the `all-phase-checkpoints-current` graduate gate framing as the per-capability backstop in `src/workflow/gate-eval.ts`; add a test asserting bypassed work can't graduate (FR-015).
- [ ] T025 [US3] Manual integration: quickstart Scenario G.

## Phase 6: User Story 4 — cross-vendor parity + capability-not-vendor purity (Priority: P3)

**Goal**: Same verdict/exit across adapters for observable surfaces; decision core branches on capability/identity only.

**Independent test**: quickstart Scenario F under each adapter; the purity test.

- [ ] T026 [P] [US4] Write failing purity tests in `src/__tests__/capability/purity.test.ts`: the decision core contains no vendor-identity branch and no hardcoded `.claude/skills` path (FR-006, static-scan + behavior).
- [ ] T027 [US4] Add the Codex PreToolUse adapter (Bash-only, research D8) calling the same `mediate-check` verb; document the skill-surface backstop reliance on Codex.
- [ ] T028 [US4] Cross-vendor parity test: identical verdict + exit code for the same raw Bash call across the Claude and Codex adapters (SC-005).

## Phase 7: Polish & cross-cutting

- [ ] T029 [P] Extend `src/__tests__/installation-isolation-probe.test.ts` to cover the new state-writing verbs (`front-door enter/exit`) and `mediate-check --at` (anchor invariant).
- [ ] T030 [P] Amend `.claude/rules/enforcement-lives-in-skills.md` + `docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md` with the spec Decision 5 ruling (a plugin-shipped PreToolUse hook is a permitted enforcement surface; rationale + the bookkeeping-spiral distinction).
- [ ] T031 [P] Update plugin docs (capability mediation overview; `stackctl capability`/`mediate-check`/`front-door` verbs) and confirm no new file exceeds the 300–500-line cap (Principle VI; refactor if needed).
- [ ] T032 Run the full `npx vitest` suite + the quickstart CLI scenarios (A–E, G); confirm green before `/stack-control:execute` governance.

## Dependencies & ordering

- **Setup (T001)** → **Foundational (T002–T006)** → user stories.
- **US1 (T007–T018)** depends on Foundational; it is the MVP and the only story that must precede US3/US4 backstop+parity work (which reference the verb + gate). US2 (discovery) depends only on the registry (T004) and can start in parallel with US1's verb work.
- **T002 (spike)** gates T015 (the `Skill` matcher) only — the CLI/Bash path (T003–T014) does not depend on it.
- **Polish (T029–T032)** last.

## Parallel execution examples

- Foundational: T003 ∥ T005 (different test files), then T004/T006.
- US1 tests: T007 ∥ T009 ∥ T011 ∥ T013 (independent files) before their impls.
- Cross-story: US2 T019/T020 can proceed alongside US1 T015–T017 once the registry (T004) lands.

## Implementation strategy

- **MVP = US1** (Phase 3): the complete-mediation teeth for all three v1 capabilities on Claude. Shippable and independently testable on its own.
- Then **US2** (discovery/API-spec), **US3** (backstop), **US4** (cross-vendor) in priority order.
- Each task is RED-first per Constitution I; commit + push at each task boundary (Principle VII).

**Total**: 32 tasks — Setup 1 · Foundational 5 (incl. 1 spike) · US1 12 · US2 3 · US3 4 · US4 3 · Polish 4.
