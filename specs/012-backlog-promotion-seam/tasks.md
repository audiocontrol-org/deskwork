# Tasks: Backlog → Feature-Rigor Promotion Seam

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contract**: [contracts/backlog-promote.md](./contracts/backlog-promote.md)

**Tests**: REQUIRED (constitution Principle I — Test-First, RED before GREEN). Every implementation task is preceded by its failing test. Tests run against the **real** backlog store on tmp fixtures (Integration-First; no mocks).

## Format: `[ID] [P?] [Story] Description`

- **[P]** = parallelizable (different files, no incomplete dependency).
- **[US#]** = user-story phase task.

## Path Conventions

In-tree plugin: source under `plugins/stack-control/src/`, tests under `plugins/stack-control/tests/`, skill at `plugins/stack-control/skills/backlog/SKILL.md`.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 [P] Add `PROMOTED_LABEL = 'promoted'` constant (and any Promoted-to bullet prefix constant) to `plugins/stack-control/src/backlog/mappings.ts`, with a comment that promotion is orthogonal to native To Do/In Progress/Done status (data-model D3).
- [x] T002 [P] Confirm/extend the backlog test fixture helper (`plugins/stack-control/tests/backlog/helpers.ts`) can seed a store with N items carrying ids/labels/body for promote tests (reuses `COMMITTED_CONFIG` + `createBacklogBackend`).

## Phase 2: Foundational (Blocking Prerequisites)

*The promote core — blocks all three user stories.*

- [x] T003 [P] RED: `plugins/stack-control/tests/backlog/promote-targets.test.ts` — assert target-ref parsing accepts well-formed `spec:specs/NNN-slug`, `tasks:specs/NNN-slug`, `roadmap:<phase>:<kind>/<slug>` and rejects unknown/empty kinds (contract tests 6, 11).
- [x] T004 Implement `plugins/stack-control/src/backlog/promote-targets.ts` — parse + shape-validate the three typed target refs; expose the kind + normalized ref; reject malformed (no disk check — record-don't-create, D4). → GREEN T003.
- [x] T004a RED: in `plugins/stack-control/tests/backlog/backend-edit.test.ts` — assert a new `BacklogBackend.edit()` **additively** adds a label and appends a notes line to an existing task, **preserving** existing labels/refs/body (resolves analyze finding A1; D6).
- [x] T004b Add `edit()` to `BacklogBackend` in `plugins/stack-control/src/backlog/backend.ts` — shells `backlog task edit <id> --add-label <label> --append-notes <text>` via the existing `run()` (additive, no read-modify-write; the backend had only create/list/exists). → GREEN T004a.
- [x] T005 RED: `plugins/stack-control/tests/backlog/promote.test.ts` — assert the record-only writer adds the `promoted` label + a `Promoted-to: <ref>` linkage line and **preserves** existing labels/refs/body (FR-013); dry-run writes nothing (contract tests 1, 2).
- [x] T006 Implement `plugins/stack-control/src/backlog/promote.ts` — record-only promotion via `backend.edit()` (T004b): add the `promoted` label + append the `Promoted-to:` linkage, dry-run/apply, preserve fields. No target creation (FR-004). → GREEN T005.
- [x] T007 RED: in `promote.test.ts`, assert the idempotency guard — an already-`promoted` item is refused with zero write (contract test 7, FR-006).
- [x] T008 Implement the guard in `promote.ts` (detect existing `promoted` label/bullet → refuse). → GREEN T007.

**Checkpoint**: the promote core records, guards, and parses targets — verified by unit/integration tests against the real store.

---

## Phase 3: User Story 1 - Promote with recorded linkage (Priority: P1) 🎯 MVP

**Goal**: single-item `backlog promote <id> --to <spec:|roadmap:>` records the linkage; fail-loud on bad input.

**Independent test**: promote a seeded item to a `spec:`/`roadmap:` ref; assert label + bullet written (apply) / reported (dry-run); assert the fail-loud exit codes.

- [x] T009 [US1] RED: `plugins/stack-control/tests/backlog/promote.cli.test.ts` — drive `runCli(['backlog','promote',...])`: dry-run reports + zero write; `--apply` records; `spec:` and `roadmap:` record the correctly-typed ref (contract tests 1, 2, 11).
- [x] T010 [US1] RED: in `promote.cli.test.ts`, the fail-loud matrix — non-existent item → exit 1; malformed store → exit 1; missing `--to` → exit 2; bad target ref → exit 2; multiple ids with `spec:`/`roadmap:` → exit 2 (contract tests 3, 4, 5, 6, 8).
- [x] T011 [US1] Add the `promote` entry to `SUBACTION_SPECS` + a thin dispatch `case 'promote'` in `plugins/stack-control/src/subcommands/backlog.ts` that parses flags and calls `promote.ts`; map outcomes to exit codes 0/1/2 per the contract. → GREEN T009, T010.
- [x] T012 [US1] Confirm `backlog.ts` stays under the file cap after the dispatch case; if not, move the arg-parse helper into `promote.ts`/`promote-targets.ts`.

**Checkpoint**: US1 is an independently demoable MVP — a single backlog item can be promoted to a spec or roadmap target with a recorded, navigable backlink.

---

## Phase 4: User Story 2 - Task-in-tasks.md + batch (Priority: P2)

**Goal**: `tasks:` target + batching N items into one existing feature's `tasks.md` (all-or-nothing).

**Independent test**: promote 2 seeded items to a `tasks:` ref in one invocation; assert both recorded; assert one-invalid-id refuses the whole batch with zero write; assert target-absent advisory.

- [x] T013 [US2] RED: in `promote.cli.test.ts`, batch `tasks:` with all-valid ids records all; one invalid/already-promoted id → whole batch refused, zero write (contract test 9, SC-002).
- [x] T014 [US2] RED: target-path-absent → recorded with a pending-create advisory line, exit 0 (contract test 10, D4).
- [x] T015 [US2] Extend `promote.ts` + the dispatch case to accept multiple ids **only** for `tasks:` targets; validate the whole batch before any write (all-or-nothing); emit the pending-create advisory. → GREEN T013, T014.

**Checkpoint**: both promotion granularities (single → new feature/node; batch → existing feature's tasks.md) work.

---

## Phase 5: User Story 3 - Two-tier documentation cross-reference (Priority: P2)

**Goal**: the backlog tier and the feature/roadmap tier explicitly reference each other (the #443 ask).

**Independent test**: assert the backlog docs describe the promotion seam + its targets and link to the feature tier; assert the feature/roadmap docs reference the backlog as an origin.

- [x] T016 [US3] RED: `plugins/stack-control/tests/backlog/promote-docs.test.ts` — assert `skills/backlog/SKILL.md` documents the `promote` subaction (the three targets, record-don't-create, dry-run/apply) and references the feature tier; assert the feature/roadmap-tier doc references the backlog as a promotion origin (FR-012).
- [x] T017 [US3] Document the `promote` subaction in `plugins/stack-control/skills/backlog/SKILL.md` (thin adapter — quotes the verb, adds no behavior; FR-010) and add the two-tier cross-reference (backlog ↔ roadmap/feature docs, one canonical description). → GREEN T016.

**Checkpoint**: the discovery gap named by the originating issue is closed; the tiers reference each other.

---

## Phase 6: Polish & Cross-Cutting

- [x] T018 [P] `tsc` strict clean (no `any`/`as`/`@ts-ignore`); lint clean; confirm every new/modified file ≤ 500 lines (Principle VI).
- [x] T019 Execute `quickstart.md` scenarios 1–5 in a plain shell against a real install; record outcomes.
- [x] T020 Final `stackctl spec-check --spec specs/012-backlog-promotion-seam` (spec=yes plan=yes tasks=yes) and `execute-check` passes — confirm runnable.
- [x] T021 [P] Promote the originating backlog item TASK-15 itself via the new verb to `spec:specs/012-backlog-promotion-seam` (dogfood: the feature records its own origin link — the linkage that was missing).

---

## Dependencies & Execution Order

- **Phase 1 (T001–T002)** → blocks everything (label constant + fixture).
- **Phase 2 (T003–T008)** → the promote core; blocks all user stories. RED→GREEN pairs: T003/T004, **T004a/T004b (backend `edit()` — A1)**, T005/T006, T007/T008. T006 (writer) depends on T004b (backend edit). The idempotency guard (T007/T008) reads labels directly from the task file (D6), as `exists()` already does.
- **US1 (Phase 3)** depends on Phase 2; the MVP and first independently shippable increment.
- **US2 (Phase 4)** depends on US1's dispatch wiring (extends it for batch/`tasks:`).
- **US3 (Phase 5)** depends on the verb existing (US1) so the docs describe real behavior.
- **Polish (Phase 6)** last; T021 depends on the verb shipping (US1).

### Parallel opportunities

- Setup: T001 ‖ T002.
- Phase 2 RED authoring: T003 ‖ T005 (different files) before their impls.
- Polish: T018 ‖ T021.

## Implementation strategy

- **MVP = US1** (Phase 1 → 2 → 3): a single backlog item promotes to a spec/roadmap target with a recorded backlink + fail-loud guarantees. Independently demoable.
- Then US2 (tasks:/batch), US3 (docs), Polish — each a small, independently-testable increment.
- RED then GREEN per pair; commit at task boundaries; push at phase boundaries (Principle VII).
- Implementation runs in a **separate session/worktree** per the project's orchestrator-vs-implementation split (this define/plan/tasks pass is authoring only).
