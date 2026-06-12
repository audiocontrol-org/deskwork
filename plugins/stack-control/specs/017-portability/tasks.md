---
description: "Task list for portability — portable stack-control workflow across Claude Code and Codex"
---

# Tasks: Portable stack-control workflow across Claude Code and Codex

**Input**: Design documents from `/specs/017-portability/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED. Constitution Principle I (Test-First) is non-negotiable for this feature because portability must be enforced mechanically at the shared-core boundary.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Establish the portability feature scaffold and test targets.

- [X] T001 Audit the current portability seams in `plugins/stack-control/skills/` and `plugins/stack-control/src/subcommands/` against the `017-portability` contracts.
- [X] T002 [P] Identify Claude-owned release/update assets in `.claude/skills/release/` and map the shared behaviors that must move behind a host-neutral surface.
- [X] T003 [P] Identify backlog backend leakage points in `plugins/stack-control/skills/backlog/SKILL.md`, `plugins/stack-control/README.md`, and `plugins/stack-control/src/backlog/`.

---

## Phase 2: Foundational

**Purpose**: Build the shared-core portability seam that every host-facing workflow step depends on.

**⚠️ CRITICAL**: No host-specific front-door or release portability work should proceed until this seam exists and is tested.

- [X] T004 [P] RED: add shared-core portability contract tests in `plugins/stack-control/src/__tests__/` for front-door invocation ownership, host limitation fail-loud behavior, and backlog abstraction invariants.
- [X] T005 [P] RED: add release portability tests covering lockstep monorepo release invariants and same-version distribution semantics.
- [X] T006 Implement or tighten the shared-core portability seam in `plugins/stack-control/src/subcommands/` so workflow behavior is owned by `stackctl`.
- [X] T007 Implement or tighten the backlog abstraction seam in `plugins/stack-control/src/backlog/` so backend details are hidden from the stable workflow contract.
- [X] T008 Rehome or wrap release orchestration behind a host-neutral surface while preserving current lockstep semantics.

**Checkpoint**: Shared portability contract exists; host adapters can now bind to it.

---

## Phase 3: User Story 1 - Run the front door natively in either host (Priority: P1) 🎯 MVP

**Goal**: `define`, `extend`, and `execute` work natively in both Claude Code and Codex through the same shared-core behavior.

**Independent Test**: The same feature can be taken through `define`, `extend`, and `execute` from each host with matching shared-core outcomes and no host-specific workaround steps.

### Tests for User Story 1 ⚠️

- [X] T009 [P] [US1] RED: add Claude Code adapter invocation tests for front-door parity in `plugins/stack-control/src/__tests__/`.
- [X] T010 [P] [US1] RED: add Codex adapter invocation tests for front-door parity in `plugins/stack-control/src/__tests__/`.

### Implementation for User Story 1

- [X] T011 [US1] Refactor `plugins/stack-control/skills/define/SKILL.md` to rely on the shared-core contract instead of Claude-specific assumptions.
- [X] T012 [US1] Refactor `plugins/stack-control/skills/extend/SKILL.md` to rely on the shared-core contract instead of Claude-specific assumptions.
- [X] T013 [US1] Refactor `plugins/stack-control/skills/execute/SKILL.md` to rely on the shared-core contract instead of Claude-specific assumptions.
- [X] T014 [US1] Add or update Codex-facing workflow adapter assets for the front door in the appropriate stack-control host-facing surface.
- [X] T015 [US1] Verify shared-core front-door behavior remains host-neutral and fail-loud on explicit host limitations.

**Checkpoint**: Front door is usable from Claude Code and Codex without manual translation.

---

## Phase 4: User Story 2 - Manage backlog work without seeing the backend (Priority: P1)

**Goal**: backlog workflow is backend-agnostic from the user’s point of view in both hosts.

**Independent Test**: Capture, list, and promote backlog items from both hosts while the user-facing workflow exposes stack-control semantics only.

### Tests for User Story 2 ⚠️

- [X] T016 [P] [US2] RED: add backlog workflow tests proving backend invisibility and stack-control error translation in `plugins/stack-control/src/__tests__/`.
- [X] T017 [P] [US2] RED: add documentation/contract tests or assertions preventing required user-facing `backlog.md` references where the stable contract should hide them.

### Implementation for User Story 2

- [X] T018 [US2] Refactor `plugins/stack-control/skills/backlog/SKILL.md` to remove backend-specific user-contract leakage.
- [X] T019 [US2] Refactor `plugins/stack-control/README.md` backlog sections to describe a backend-agnostic workflow contract.
- [X] T020 [US2] Tighten `plugins/stack-control/src/backlog/` error translation and interface boundaries so backend details remain internal.

**Checkpoint**: Backlog feels like a stack-control capability, not a wrapper over a named backend.

---

## Phase 5: User Story 3 - Keep host behavior aligned through a shared core (Priority: P2)

**Goal**: Claude Code and Codex stay aligned through thin adapters and shared-core tests.

**Independent Test**: A shared behavior added once in the core is exposed by both hosts through thin adapter tests rather than duplicated host logic.

### Tests for User Story 3 ⚠️

- [X] T021 [P] [US3] RED: add parity-verdict tests showing adapter tests assert invocation/presentation only and reject adapter-only business logic.

### Implementation for User Story 3

- [X] T022 [US3] Introduce or refine portability verification helpers in `plugins/stack-control/src/__tests__/` for shared-core vs adapter responsibility boundaries.
- [X] T023 [US3] Update portability-facing docs to make the shared-core/adapter split explicit for future feature work.

**Checkpoint**: Future portability work has a mechanical parity guardrail.

---

## Phase 6: User Story 4 - Release and updates stay atomic across hosts (Priority: P2)

**Goal**: portable release/update behavior preserves the current monorepo lockstep semantics while supporting Claude and Codex consumption paths from the same release event.

**Independent Test**: A release dry-run/fixture validates one version line, one release event, and zero host-specific version drift across shipped artifacts.

### Tests for User Story 4 ⚠️

- [X] T024 [P] [US4] RED: add release portability tests for lockstep artifact/version behavior and same-version distribution-channel mapping.
- [X] T025 [P] [US4] RED: add tests verifying the host-neutral release surface preserves current atomic semantics rather than introducing host-specific flows.

### Implementation for User Story 4

- [X] T026 [US4] Rehome or wrap `.claude/skills/release/` helpers behind the host-neutral release surface identified in T008.
- [X] T027 [US4] Add Codex-consumable install/update path documentation and contract wiring tied to the same release version line.
- [X] T028 [US4] Update `.agents/skills/release/SKILL.md` and any relevant stack-control or repo docs to point at the portable release contract.

**Checkpoint**: Release/update portability is additive to hosts and preserves lockstep monorepo release behavior.

---

## Phase 7: User Story 5 - The deprecated repo-wide feature workflow is retired (Priority: P2)

**Goal**: remove or explicitly deprecate the old repo-wide feature workflow so `stack-control` is the one canonical feature path.

**Independent Test**: Repository guidance and deprecated entry points no longer present the old feature workflow as an active peer to `stack-control`.

### Tests for User Story 5 ⚠️

- [X] T029 [P] [US5] RED: add guidance/entry-point assertions that fail if deprecated repo-wide feature workflow references remain active without deprecation or redirect language.

### Implementation for User Story 5

- [X] T030 [US5] Update repo guidance files that currently present the old repo-wide feature workflow as active so they point to `stack-control` instead.
- [X] T031 [US5] Deprecate, redirect, or remove old repo-wide feature workflow entry points in `.agents/` and related docs so operators are not routed there by accident.
- [X] T032 [US5] Verify the deprecation path is explicit and fail-loud where removal is not yet possible.

**Checkpoint**: Starting feature work now exposes one clear canonical workflow path.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final documentation, verification, and regression cleanup across all stories.

- [X] T033 [P] Run the quickstart scenarios in `specs/017-portability/quickstart.md` and record results.
- [X] T034 [P] Update `CLAUDE.md` managed plan pointer and any active portability references once implementation planning is complete.
- [X] T035 Review remaining Claude-only wording, host-coupled release/backlog references, or stale deprecated-workflow references in stack-control docs and remove or scope them deliberately.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; blocks all user stories
- **US1 / US2**: depend on Foundational; can proceed in parallel
- **US3**: depends on Foundational and benefits from US1/US2 landing first
- **US4**: depends on Foundational and on the shared-core release seam identified there
- **Polish**: depends on the stories it validates

### User Story Dependencies

- **US1** is the MVP and the primary portability proof
- **US2** is equally load-bearing for day-to-day workflow because backlog is a primary user-facing surface
- **US3** reinforces maintainability after US1/US2
- **US4** ensures operational portability without breaking release atomicity
- **US5** removes the deprecated competing workflow path so portability becomes canonical

## Parallel Opportunities

- T002 and T003 can run in parallel
- T004 and T005 can run in parallel
- US1 and US2 RED tests can run in parallel after the foundational seam is identified
- US4 test design can proceed in parallel with runtime portability work once release invariants are pinned

## Implementation Strategy

### MVP First

1. Finish Foundational shared-core seam
2. Deliver US1 front-door portability
3. Deliver US2 backlog backend invisibility
4. Validate both hosts on the same feature workflow

### Incremental Delivery

1. Shared-core authority
2. Front door parity
3. Backlog abstraction hardening
4. Ongoing parity guardrails
5. Release/update portability
6. Decommission deprecated repo-wide workflow

## Notes

- Portability is not complete if only runtime behavior is shared while release/update behavior remains host-owned.
- The release path must preserve monorepo lockstep semantics; portability cannot split the version line.
