# Tasks: Audit protocol friction burndown

**Input**: Design documents from `/specs/021-audit-protocol-friction-burndown/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. TDD remains mandatory for protocol changes.

**Organization**: Tasks are grouped by user story so each protocol seam can be verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable
- **[Story]**: `US1`..`US5`

## Phase 1: Setup

**Purpose**: Add fixtures and protocol records needed by later stories.

- [ ] T001 [P] Add a multi-phase govern fixture with checkpoint, nested-installation, and rename cases under `plugins/stack-control/src/__tests__/fixtures/govern/021-audit-protocol/`
- [ ] T002 [P] Add lane-capability and negotiation fixtures covering healthy, undersized, unavailable, and degraded fleets under `plugins/stack-control/src/__tests__/fixtures/govern/021-fleet/`
- [ ] T003 [P] Add typed protocol records for phase checkpoints, boundary estimates / measurements, and fleet negotiation in `plugins/stack-control/src/govern/checkpoint-state.ts`, `plugins/stack-control/src/govern/phase-boundary-sizing.ts`, `plugins/stack-control/src/govern/lane-capabilities.ts`, and `plugins/stack-control/src/govern/fleet-negotiation.ts`

---

## Phase 2: Foundational

**Purpose**: Shared protocol seams used by every story.

- [ ] T004 Implement authoritative installation-anchor propagation through the govern path in `plugins/stack-control/src/subcommands/govern.ts` and `plugins/stack-control/src/govern/protocol.ts`
- [ ] T005 Implement durable phase-checkpoint persistence and freshness comparison in `plugins/stack-control/src/govern/checkpoint-state.ts`
- [ ] T006 Implement lane capability loading and normalization in `plugins/stack-control/src/govern/lane-capabilities.ts`

**Checkpoint**: govern can resolve one anchor, checkpoint records exist, and lane capability data is available before story-specific behavior lands.

---

## Phase 3: User Story 1 - Per-phase governance has mechanical teeth (Priority: P1) 🎯 MVP

**Goal**: make required per-phase govern mechanically enforceable and freshness-aware.

**Independent Test**: missing or stale checkpoints block advancement and whole-feature substitution.

- [ ] T007 [P] [US1] RED: add fixture tests proving a required phase cannot be skipped, and that stale checkpoints are rejected, in `plugins/stack-control/src/__tests__/govern/phase-checkpoints.test.ts`
- [ ] T008 [US1] Implement required-phase checkpoint enforcement in `plugins/stack-control/src/govern/incremental-audit.ts`
- [ ] T009 [US1] Wire checkpoint freshness validation into `plugins/stack-control/src/subcommands/govern.ts`
- [ ] T010 [US1] RED→GREEN integration: prove whole-feature govern composes from required phase checkpoints instead of erasing them in `plugins/stack-control/src/__tests__/govern/govern-phase-composition.test.ts`

---

## Phase 4: User Story 2 - Phase boundaries are right-sized before and after implementation (Priority: P1)

**Goal**: prospective and actual boundary sizing gain mechanical teeth.

**Independent Test**: a prospectively-safe but actually-oversized phase fails with `boundary-too-large`.

- [ ] T011 [P] [US2] RED: add tests for prospective sizing recommendations in `plugins/stack-control/src/__tests__/govern/phase-boundary-sizing.test.ts`
- [ ] T012 [US2] Implement prospective boundary estimation in `plugins/stack-control/src/govern/phase-boundary-sizing.ts`
- [ ] T013 [P] [US2] RED: add tests for actual payload measurement against fleet envelopes in `plugins/stack-control/src/__tests__/govern/actual-payload-fit.test.ts`
- [ ] T014 [US2] Implement actual payload fit checks in `plugins/stack-control/src/govern/phase-boundary-sizing.ts` and `plugins/stack-control/src/govern/payload-implement.ts`
- [ ] T015 [US2] Wire `boundary-too-large` govern failure through `plugins/stack-control/src/subcommands/govern.ts`

---

## Phase 5: User Story 3 - Fleet capability knowledge and negotiation are autonomous (Priority: P1)

**Goal**: select or reject the fleet before remediation payload assembly.

**Independent Test**: negotiation either picks a viable fleet or exits explicit failure before payload assembly.

- [ ] T016 [P] [US3] RED: add tests for healthy, undersized, unavailable, and known-bad lane negotiation in `plugins/stack-control/src/__tests__/govern/fleet-negotiation.test.ts`
- [ ] T017 [US3] Implement fleet negotiation in `plugins/stack-control/src/govern/fleet-negotiation.ts`
- [ ] T018 [US3] Integrate negotiation ahead of remediation payload assembly in `plugins/stack-control/src/govern/protocol.ts`
- [ ] T019 [US3] Update configured capability / envelope surfaces in `plugins/stack-control/templates/audit-barrage-config.yaml` and any loader seams needed in `plugins/stack-control/src/subcommands/audit-barrage.ts`
- [ ] T020 [US3] RED→GREEN integration: prove remediation payload assembly never starts after negotiation failure in `plugins/stack-control/src/__tests__/govern/govern-negotiation-order.test.ts`

---

## Phase 6: User Story 4 - Per-phase govern scopes the real intended work (Priority: P2)

**Goal**: fix the currently open scoping and anchor debt that undermines trustworthy phase governance.

**Independent Test**: nested-installation, non-colon phase headers, and rename-heavy diffs resolve correctly.

- [ ] T021 [P] [US4] RED: add tests for non-colon / richer phase headers in `plugins/stack-control/src/__tests__/govern/govern-phase-header-grammar.test.ts`
- [ ] T022 [US4] Replace brittle phase parsing with authoritative boundary resolution in `plugins/stack-control/src/govern/incremental-audit.ts`
- [ ] T023 [P] [US4] RED: add nested-installation and anchor-consistency tests spanning govern, slush, and backlog seams in `plugins/stack-control/src/__tests__/govern/govern-anchor-unification-021.test.ts`
- [ ] T024 [US4] Complete one-anchor resolution across govern sub-steps in `plugins/stack-control/src/govern/protocol.ts` and related helper seams
- [ ] T025 [P] [US4] RED: add rename / tree-move scope retention tests in `plugins/stack-control/src/__tests__/govern/govern-rename-scope.test.ts`
- [ ] T026 [US4] Implement rename-aware payload scoping in `plugins/stack-control/src/govern/payload-implement.ts`

---

## Phase 7: User Story 5 - Fleet degradation and payload problems are reported honestly (Priority: P2)

**Goal**: degraded terminal states are explicit and machine-distinguishable.

**Independent Test**: floor shortfall, negotiation failure, coverage degradation, and boundary-too-large each produce unique terminal reporting.

- [ ] T027 [P] [US5] RED: add terminal-state reporting tests in `plugins/stack-control/src/__tests__/govern/govern-terminal-outcomes.test.ts`
- [ ] T028 [US5] Extend `plugins/stack-control/src/subcommands/audit-barrage-fleet.ts` and `plugins/stack-control/src/subcommands/govern.ts` to surface explicit terminal outcomes
- [ ] T029 [US5] Trim control-plane noise from remediation payloads in `plugins/stack-control/src/govern/protocol.ts`

---

## Phase 8: Polish & Cross-Cutting

- [ ] T030 [P] Update quickstart validation evidence in `specs/021-audit-protocol-friction-burndown/quickstart.md`
- [ ] T031 [P] Reconcile and close or re-scope linked backlog items touched by this feature
- [ ] T032 Run targeted Vitest suites plus the plugin test umbrella and record any pre-existing unrelated failures

## Dependencies & Execution Order

- Setup and Foundational phases must land first.
- `US1`, `US2`, and `US3` are the MVP and share the new protocol records, but their RED tests can be written in parallel.
- `US4` depends on the anchor and checkpoint seams from Foundational plus the enforced per-phase path from `US1`.
- `US5` should land after negotiation and boundary gates exist so terminal reporting reflects the true protocol states.

## Implementation Strategy

1. Land Setup + Foundational.
2. Finish `US1`, `US2`, and `US3` to establish the new mechanically-enforced audit path.
3. Harden scoping and anchor correctness in `US4`.
4. Finish explicit terminal reporting in `US5`.
5. Close the loop with validation evidence and backlog reconciliation.
