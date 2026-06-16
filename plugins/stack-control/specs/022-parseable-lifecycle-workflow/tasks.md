# Tasks: Parseable lifecycle workflow engine

**Input**: Design documents from `/specs/022-parseable-lifecycle-workflow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. TDD is mandatory (Constitution Principle I) — every behavior lands RED→GREEN.

**Organization**: Tasks are grouped by user story so each phase is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: `US1`..`US8`

## Phase 1: Setup

**Purpose**: fixtures and module scaffolding the later phases need.

- [X] T001 [P] Add workflow fixtures (a sample governed `WORKFLOW.md`, roadmap nodes at each artifact state across the derivation table, and a nested adopter-repo installation) under `plugins/stack-control/src/__tests__/fixtures/workflow/`
- [X] T002 [P] Scaffold the new `src/workflow/` module directory with typed stubs for `workflow-grammar.ts`, `phase-derivation.ts`, `gate-eval.ts`, `transition-engine.ts`, `effects.ts`, `house-rules.ts` in `plugins/stack-control/src/workflow/`
- [X] T003 [P] Add the typed protocol records (Phase, Transition, Criterion, Effect, GovernConvergenceRecord, HouseRulesBlock, DesignRecord, WorkflowDoc) from data-model.md in `plugins/stack-control/src/workflow/workflow-types.ts`

---

## Phase 2: Foundational

**Purpose**: shared seams every story reads. MUST complete before the user stories.

- [X] T004 Author the plugin-bundled default `plugins/stack-control/templates/WORKFLOW.md` — the canonical 7-phase lifecycle (captured→…→shipped) + side-states, with phase + transition units, derive predicates, gate criteria, and effect manifests, conforming to the grammar contract. (Analyze O1: either wire the `doc set-status-field` effect into a concrete transition here — e.g. a feature-README status-table update on `graduate` — or add an inline note that it is an available-but-unused v1 verb; do not leave its v1 use ambiguous.) (Workflow-policy 2026-06-16: the `specifying → implementing` exit gate is `speckit-analyze`-clean by DEFAULT; do NOT make a spec-govern convergence record a default-required criterion — spec audit-barrage is parked. The `governing → shipped` gate DOES require the impl-govern convergence record.)
- [X] T005 Implement WORKFLOW.md grammar binding via the `document-model` engine in `plugins/stack-control/src/workflow/workflow-grammar.ts` (parse phase + transition units; fail loud on malformed)
- [X] T006 Implement bundled-default + per-install override resolution for `WORKFLOW.md` (installation copy wins, else bundled) in `plugins/stack-control/src/workflow/workflow-grammar.ts`, reusing the existing override resolver
- [X] T007 Add the new roadmap node fields `design:`, `design-approved:`, and `analyze-clean:` (alongside existing `spec:`) to the node reader in `plugins/stack-control/src/roadmap/roadmap-model.ts`. (`analyze-clean:` is the `node-marker` the default `specifying → implementing` gate reads — analyze U1; spec audit-barrage parked.)

**Checkpoint**: the engine can load a governed `WORKFLOW.md`, resolve overrides, and read all node fields.

---

## Phase 3: User Story 2 - The current phase is derived, never stored (Priority: P1)

**Goal**: a total, deterministic phase-derivation function over existing artifacts. (Sequenced before US1 because the query surface consumes it.)

**Independent Test**: drive a fixture item through each artifact state; the derived phase matches the table; no phase field is ever written.

- [X] T008 [P] [US2] RED: derivation totality + determinism tests (every artifact state → exactly one phase; identical inputs → identical phase; `designing` keyed on the `design:` pointer not file existence) in `plugins/stack-control/src/__tests__/workflow/phase-derivation.test.ts`
- [X] T009 [US2] Implement the pure phase-derivation function in `plugins/stack-control/src/workflow/phase-derivation.ts` (reads node status, `design:`/`spec:` pointers, govern-convergence records, `tasks.md` completion, release tag; writes nothing)
- [X] T010 [US2] Implement terminal side-state derivation (`blocked`/`cancelled`/`retired`) in `plugins/stack-control/src/workflow/phase-derivation.ts`

---

## Phase 4: User Story 1 - Mechanical, queryable stage gates (Priority: P1) 🎯 MVP

**Goal**: the read-only query surface answering the three operator questions.

**Independent Test**: `workflow status`/`can-enter` report met/unmet criteria deterministically; re-run yields identical output and zero writes.

- [X] T011 [P] [US1] RED: gate-evaluation tests (each criterion kind → definite true/false; unmet enumeration M of N; judgment criterion reads the `design-approved:` node marker) in `plugins/stack-control/src/__tests__/workflow/gate-eval.test.ts`
- [X] T012 [US1] Implement criterion predicates + unmet enumeration in `plugins/stack-control/src/workflow/gate-eval.ts`
- [X] T013 [P] [US1] RED: query-verb tests (`status`/`can-enter`/`next` output + read-only determinism; AND — analyze U1 — assert an unmet gate is REPORTED, not enforced as a refusal: v1 gates never block) in `plugins/stack-control/src/__tests__/workflow/query-verbs.test.ts`
- [X] T014 [US1] Implement `workflow status` and `workflow can-enter` (read-only) in `plugins/stack-control/src/subcommands/workflow.ts`
- [X] T015 [US1] Implement `workflow next` (derive phase, name next transition + WORK skill, preview effects) in `plugins/stack-control/src/subcommands/workflow.ts`

**Checkpoint**: MVP — the gates are queryable end-to-end without advancing anything.

---

## Phase 5: User Story 3 - A governed WORKFLOW.md is the single source of truth (Priority: P1)

**Goal**: prove the doc, not code, governs behavior; malformed fails loud.

**Independent Test**: mutating a criterion in `WORKFLOW.md` changes the query answer; a malformed doc fails loud naming the violation.

- [X] T016 [P] [US3] RED: source-of-truth tests (a criterion edited in `WORKFLOW.md` changes engine behavior; malformed doc → fail loud, no default fallback) in `plugins/stack-control/src/__tests__/workflow/workflow-md-source-of-truth.test.ts`
- [X] T017 [US3] Harden grammar parsing fail-loud + the override-resolution edges surfaced by T016 in `plugins/stack-control/src/workflow/workflow-grammar.ts`

---

## Phase 6: User Story 4 - Deterministic, atomic advance with a fixed effect vocabulary (Priority: P1)

**Goal**: `workflow advance` fires the effect manifest atomically (commit-last; git rollback); fixed 7-verb vocabulary.

**Independent Test**: success → all effects in one trailing commit; injected fault → touched paths restored, nothing committed; dirty tree → refuse loud.

- [X] T018 [P] [US4] RED: atomicity fault-injection tests (fault at each effect position → restore touched paths, nothing committed; dirty advance-touched tree → refuse loud; success → single trailing commit) in `plugins/stack-control/src/__tests__/workflow/advance-atomic.test.ts`
- [X] T019 [P] [US4] RED: effect-vocabulary tests (each of the 7 verbs dispatches; `commit` always last; a non-vocabulary effect is rejected; AND — FR-017 — a heavy/interactive verb (design backend, the Spec Kit chain, `execute`, `govern`, `release`) MUST be rejected as an effect: advance fires lightweight bookkeeping only) in `plugins/stack-control/src/__tests__/workflow/effects.test.ts`
- [X] T020 [US4] Implement the fixed effect-vocabulary dispatch (`roadmap-advance`, `roadmap-reconcile`, `journal-append`, `doc-set-status-field`, `workflow-link-design`, `workflow-link-spec`, `commit`) in `plugins/stack-control/src/workflow/effects.ts`
- [X] T021 [US4] Implement the transition engine: clean-tree precondition, validate-all, apply non-commit mutations, commit-last, restore-on-failure in `plugins/stack-control/src/workflow/transition-engine.ts`
- [X] T022 [US4] Implement `workflow advance` (dry-run preview + `--apply`) and the new `workflow link-design` / `workflow link-spec` verbs in `plugins/stack-control/src/subcommands/workflow.ts`

---

## Phase 7: User Story 5 - The designing phase + opinionated frontend over a swappable backend (Priority: P1)

**Goal**: `/stack-control:design` drives a capability-selected backend in-session; the design-to-spec exit gate is mechanical.

**Independent Test**: entry sets the `design:` pointer; the record is written installation-anchored with required sections; the exit gate fails loud on a missing section / <2 alternatives / absent approval marker.

- [X] T023 [P] [US5] RED: design-to-spec exit-gate tests (missing required section, <2 solution-space alternatives, absent `design-approved:` marker each fail the gate) in `plugins/stack-control/src/__tests__/workflow/design-gate.test.ts`
- [X] T024 [US5] Implement the single-source house-rules block (injected into the backend AND read by the exit gate) in `plugins/stack-control/src/workflow/house-rules.ts`
- [X] T025 [US5] Implement the `design-to-spec` exit gate (required sections, ≥2 alternatives, approval marker) in `plugins/stack-control/src/workflow/gate-eval.ts`
- [X] T026 [US5] Author `plugins/stack-control/skills/design/SKILL.md` — the frontend that drives the backend (default `superpowers:brainstorming`) in-session, sets the `design:` pointer on entry, re-injects capture-over-YAGNI at the backend scope-check step, routes the terminal handoff to `/stack-control:define`, and writes the record at `<install-root>/docs/superpowers/specs/`

---

## Phase 8: User Story 6 - Governance graduation is recorded on disk (Priority: P2)

**Goal**: a mode-keyed govern-convergence record makes `governing→shipped` mechanical (absorbs TASK-19). The record MECHANISM is symmetric (spec + impl), but per the 2026-06-16 workflow-policy decision the spec-govern GATE is parked/opt-in — `governing→shipped` (impl) is the required default gate; `specifying→implementing` is `speckit-analyze`-clean by default.

**Independent Test**: a converged IMPL govern run writes the record inside the installation; the `governing→shipped` gate passes only when recorded ∧ converged; no agent assertion substitutes. The spec-mode record is exercised as an opt-in path, not a default-required gate.

- [X] T027 [P] [US6] RED: govern-convergence-record tests (impl mode required for `governing→shipped`, passes only recorded ∧ converged, tasks-100%-but-no-record → gate unmet; spec mode written/read as an OPT-IN path; `specifying→implementing` default gate is analyze-clean, NOT spec-govern-required) in `plugins/stack-control/src/__tests__/workflow/govern-record.test.ts`
- [X] T028 [US6] Implement the symmetric mode-keyed govern-convergence record mechanism (write on convergence; installation-anchored; reuse the 021 checkpoint fingerprint shape) in `plugins/stack-control/src/govern/convergence-record.ts` — retain spec mode in the mechanism even though its gate is parked
- [X] T029 [US6] Wire the record into the impl govern emit site (required gate) and the opt-in `govern --mode spec` path in `plugins/stack-control/src/subcommands/govern.ts`, and into phase-derivation in `plugins/stack-control/src/workflow/phase-derivation.ts` (default `specifying→implementing` = the `analyze-clean:` node-marker, NOT the spec-govern record; spec-govern record is the opt-in alternative gate — analyze U1)

---

## Phase 9: User Story 7 - Every authored artifact stays inside the installation domain (Priority: P2)

**Goal**: no authored artifact escapes the installation tree (the constitution's installation-anchor invariant).

**Independent Test**: in a nested adopter-repo fixture, a probe asserts every authored artifact path resolves inside the installation tree; no-installation → refuse loud.

- [X] T030 [P] [US7] RED: installation-isolation probe over the full workflow surface (WORKFLOW.md override, design record, govern-convergence record, effect bookkeeping) in `plugins/stack-control/src/__tests__/workflow/installation-isolation-022.test.ts`, mirroring `installation-isolation-probe.test.ts`
- [X] T031 [US7] Make every workflow authored-path resolve through the installation anchor (and refuse loud with no enclosing installation) across `plugins/stack-control/src/workflow/` and `plugins/stack-control/src/subcommands/workflow.ts`

---

## Phase 10: User Story 8 - Mid-stream re-design re-entry (Priority: P3)

**Goal**: a `* → designing` re-entry re-revisions the design record, stales affected downstream checkpoints, preserves the spec dir as a revision.

**Independent Test**: from `implementing`, a re-entry opens a new design-record revision, stales the affected checkpoints, and preserves the spec dir.

> **Note (design depth):** this is the thinnest area (spec FR-032 / research D10). T032 begins with a focused design/RED pass nailing the staleness-invalidation scope and spec-dir revisioning semantics before T033 implements.

- [ ] T032 [P] [US8] RED: re-entry tests (new design-record revision opened not overwritten; affected downstream checkpoints marked stale; spec dir preserved as a revision) in `plugins/stack-control/src/__tests__/workflow/redesign-reentry.test.ts`
- [ ] T033 [US8] Implement the `* → designing` re-entry transition (revision the record; invalidate affected checkpoints via `src/govern/checkpoint-state.ts`; preserve the spec dir) in `plugins/stack-control/src/workflow/transition-engine.ts`

---

## Phase 11: Polish & Cross-Cutting

- [ ] T034 [P] Document the workflow surface (verbs + the governed `WORKFLOW.md` grammar) and update `quickstart.md` with validation evidence in `specs/022-parseable-lifecycle-workflow/quickstart.md`. (Analyze U2: include a self-hosting validation bullet — SC-008 — demonstrating the workflow verbs can drive the next feature's item through its phases.)
- [ ] T035 [P] Reconcile linked backlog items: record disposition + post evidence for TASK-19 (governance-graduation-record delivered — closure is the operator's call after release verification, per the constitution's closure gate; do not self-close), note TASK-136 (this feature) and TASK-137 (`roadmap reparent` precedent); record dispositions
- [ ] T036 Run the targeted Vitest suites plus the plugin test umbrella; record results and any pre-existing unrelated failures

## Dependencies & Execution Order

- Setup (Phase 1) and Foundational (Phase 2) land first and block all stories.
- US2 (derivation) precedes US1 (query) — the query surface consumes derivation; both are P1/MVP.
- US3 hardens the governed-doc contract the Foundational grammar binding established.
- US4 (advance/effects), US5 (designing/frontend) are P1 and build on the MVP query/derivation seams.
- US6 (govern record) feeds back into US2 derivation (the spec/impl convergence signals).
- US7 (isolation) is a cross-cutting invariant verified once the authored artifacts exist.
- US8 (re-design re-entry) depends on US5 (designing) + the 021 checkpoint-staleness machinery.

## Implementation Strategy

1. Land Setup + Foundational (governed doc + grammar + node fields).
2. Finish US2 + US1 to establish the queryable, derived MVP.
3. Add US3 (doc-is-SoT hardening), US4 (atomic advance), US5 (designing frontend).
4. Land US6 (govern record / TASK-19), then US7 (isolation invariant).
5. Land US8 (re-design re-entry) after its focused design pass.
6. Close with polish, backlog reconciliation, and the full umbrella.
