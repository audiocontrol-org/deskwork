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

- [X] T001 [P] Add a multi-phase govern fixture with checkpoint, nested-installation, and rename cases under `plugins/stack-control/src/__tests__/fixtures/govern/021-audit-protocol/`
- [X] T002 [P] Add lane-capability and negotiation fixtures covering healthy, undersized, unavailable, and degraded fleets under `plugins/stack-control/src/__tests__/fixtures/govern/021-fleet/` (NOTE: the `templates/fleet-knowledge.yaml` shipped-fallback clause was superseded — the no-runtime-fallback HIGH fix removed it; setup seeds the installation file instead)
- [X] T003 [P] Add typed protocol records for phase checkpoints, boundary estimates / measurements, and fleet negotiation in `plugins/stack-control/src/govern/checkpoint-state.ts`, `plugins/stack-control/src/govern/phase-boundary-sizing.ts`, `plugins/stack-control/src/govern/lane-capabilities.ts`, and `plugins/stack-control/src/govern/fleet-negotiation.ts`

---

## Phase 2: Foundational

**Purpose**: Shared protocol seams used by every story.

- [X] T004 Implement authoritative installation-anchor propagation through the govern path in `plugins/stack-control/src/subcommands/govern.ts` and `plugins/stack-control/src/govern/protocol.ts`
- [X] T005 Implement durable phase-checkpoint persistence and freshness comparison in `plugins/stack-control/src/govern/checkpoint-state.ts`
- [X] T006 Implement lane capability loading and normalization in `plugins/stack-control/src/govern/lane-capabilities.ts`

**Checkpoint**: govern can resolve one anchor, checkpoint records exist, and lane capability data is available before story-specific behavior lands.

---

## Phase 3: User Story 1 - Per-phase governance has mechanical teeth (Priority: P1) 🎯 MVP

**Goal**: make required per-phase govern mechanically enforceable and freshness-aware.

**Independent Test**: missing or stale checkpoints block advancement and whole-feature substitution.

- [X] T007 [P] [US1] RED: add fixture tests proving a required phase cannot be skipped, and that stale checkpoints are rejected, in `plugins/stack-control/src/__tests__/govern/phase-checkpoints.test.ts`
- [X] T008 [US1] Implement required-phase checkpoint enforcement in `plugins/stack-control/src/govern/incremental-audit.ts`
- [X] T009 [US1] Wire checkpoint freshness validation into `plugins/stack-control/src/subcommands/govern.ts`
- [X] T010 [US1] RED→GREEN integration: prove whole-feature govern composes from required phase checkpoints instead of erasing them in `plugins/stack-control/src/__tests__/govern/govern-phase-composition.test.ts`

---

## Phase 4: User Story 2 - Phase boundaries are right-sized before and after implementation (Priority: P1)

**Goal**: prospective and actual boundary sizing gain mechanical teeth.

**Independent Test**: a prospectively-safe but actually-oversized phase fails with `boundary-too-large`.

- [X] T011 [P] [US2] RED: add tests for prospective sizing recommendations in `plugins/stack-control/src/__tests__/govern/phase-boundary-sizing.test.ts`
- [X] T012 [US2] Implement prospective boundary estimation in `plugins/stack-control/src/govern/phase-boundary-sizing.ts`
- [X] T013 [P] [US2] RED: add tests for actual payload measurement against fleet envelopes in `plugins/stack-control/src/__tests__/govern/actual-payload-fit.test.ts`
- [X] T014 [US2] Implement actual payload fit checks in `plugins/stack-control/src/govern/phase-boundary-sizing.ts` and `plugins/stack-control/src/govern/payload-implement.ts`
- [X] T015 [US2] Wire `boundary-too-large` govern failure through `plugins/stack-control/src/subcommands/govern.ts`

---

## Phase 5: User Story 3 - Fleet capability knowledge and negotiation are autonomous (Priority: P1)

**Goal**: select or reject the fleet before remediation payload assembly.

**Independent Test**: negotiation either picks a viable fleet or exits explicit failure before payload assembly.

- [X] T016 [P] [US3] RED: add tests for healthy, undersized, unavailable, and known-bad lane negotiation in `plugins/stack-control/src/__tests__/govern/fleet-negotiation.test.ts`
- [X] T017 [US3] Implement fleet negotiation in `plugins/stack-control/src/govern/fleet-negotiation.ts`
- [X] T018 [US3] Integrate negotiation ahead of remediation payload assembly in `plugins/stack-control/src/govern/protocol.ts`
- [X] T019 [US3] Update configured capability / envelope surfaces in `plugins/stack-control/templates/audit-barrage-config.yaml` and any loader seams needed in `plugins/stack-control/src/subcommands/audit-barrage.ts`
- [X] T020 [US3] RED→GREEN integration: prove remediation payload assembly never starts after negotiation failure in `plugins/stack-control/src/__tests__/govern/govern-negotiation-order.test.ts`

---

## Phase 6: User Story 4 - Per-phase govern scopes the real intended work (Priority: P2)

**Goal**: fix the currently open scoping and anchor debt that undermines trustworthy phase governance.

**Independent Test**: nested-installation, non-colon phase headers, and rename-heavy diffs resolve correctly.

- [X] T021 [P] [US4] RED: add tests for non-colon / richer phase headers in `plugins/stack-control/src/__tests__/govern/govern-phase-header-grammar.test.ts`
- [X] T022 [US4] Replace brittle phase parsing with authoritative boundary resolution in `plugins/stack-control/src/govern/incremental-audit.ts`
- [X] T023 [P] [US4] RED: add nested-installation and anchor-consistency tests spanning govern, slush, and backlog seams in `plugins/stack-control/src/__tests__/govern/govern-anchor-unification-021.test.ts`
- [X] T024 [US4] Complete one-anchor resolution across govern sub-steps in `plugins/stack-control/src/govern/protocol.ts` and related helper seams (verified-satisfied + locked by the T023 regression test)
- [X] T025 [P] [US4] RED: add rename / tree-move scope retention tests in `plugins/stack-control/src/__tests__/govern/govern-rename-scope.test.ts`
- [X] T026 [US4] Implement rename-aware payload scoping in `plugins/stack-control/src/govern/payload-implement.ts`

---

## Phase 7: User Story 5 - Fleet degradation and payload problems are reported honestly (Priority: P2)

**Goal**: degraded terminal states are explicit and machine-distinguishable.

**Independent Test**: floor shortfall, negotiation failure, coverage degradation, and boundary-too-large each produce unique terminal reporting.

- [X] T027 [P] [US5] RED: add terminal-state reporting tests in `plugins/stack-control/src/__tests__/govern/govern-terminal-outcomes.test.ts` (graduated / blocked / negotiation-failed; boundary-too-large found structurally unreachable — see TASK-117)
- [X] T028 [US5] Surface explicit machine-readable terminal outcomes (`govern: terminal-outcome=<kind>`) via `GovernTerminalKind` in `protocol.ts` + the emit sites in `plugins/stack-control/src/subcommands/govern.ts`
- [X] T029 [US5] Trim control-plane noise (the `.stack-control/audit-runs` run-artifact dir) from remediation payloads via `resolveGovernExcludePaths` in `plugins/stack-control/src/subcommands/govern.ts` (TASK-57)

---

## Phase 8: Polish & Cross-Cutting

- [X] T030 [P] Update quickstart validation evidence in `specs/021-audit-protocol-friction-burndown/quickstart.md`
- [X] T031 [P] Reconcile and close or re-scope linked backlog items touched by this feature (closed TASK-71 via T022, TASK-57 via T029; TASK-47 partially addressed by T026 and kept open for the cross-boundary residual; new findings TASK-116 hermetic-fixtures, TASK-117 boundary-too-large-unreachable)
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
