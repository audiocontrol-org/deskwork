# Tasks: Transitive item closure + the post-ship terminal stage

**Feature**: `031-transitive-item-closure` | **Branch**: `feature/stack-control`
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**TDD is mandatory** (Constitution Principle I): every implementation task is
preceded by a RED test watched to fail for the expected reason. Tests use on-disk
fixtures (never mock the filesystem — `.claude/rules/testing.md`). Every new/changed
file ≤ 500 lines (Principle VI). Commit + push at each task boundary (Principle VII).

All paths are under `plugins/stack-control/`.

## Phase 1: Setup

- [X] T001 Add a fixture-builder helper for roadmap+backlog test trees (terminal/non-terminal nodes, `part-of` edges, `closes:` sets, backlog ids) in `src/roadmap/__tests__/fixtures/closure-fixtures.ts`

## Phase 2: Foundational (blocking prerequisites — MUST complete before US1/US3)

- [X] T002 [P] RED: test that `grammars/roadmap.peg` admits `closed` in `statusVocabulary` and `terminalStatuses` in `src/roadmap/__tests__/grammar-closed-status.test.ts`
- [X] T003 Add `closed` to `statusVocabulary` and `terminalStatuses` in `grammars/roadmap.peg` (GREEN T002)
- [X] T004 [P] RED: test that `roadmap-model` treats `closed` as terminal (status parse + terminal-set membership) in `src/roadmap/__tests__/roadmap-model-closed.test.ts`
- [X] T005 Admit `closed` into the terminal-status handling in `src/roadmap/roadmap-model.ts` (GREEN T004; derive from grammar — no hardcoded duplicate set)
- [X] T006 [P] RED: test `childrenOf(model, parentId)` returns items whose `partOf` includes the parent (incl. multi-parent) in `src/roadmap/__tests__/graph-children-of.test.ts`
- [X] T007 Add `childrenOf(model, parentId)` to `src/roadmap/graph.ts` mirroring `blocks()` (GREEN T006)
- [X] T008 [P] RED: test `WORKFLOW.md` defines `phase:closed` after `phase:shipped` (terminal, no `next`) + a `shipped → closed` transition in `src/workflow/__tests__/workflow-closed-phase.test.ts`
- [X] T009 Add `phase:closed` + the `shipped → closed` transition to `templates/WORKFLOW.md` (GREEN T008)

## Phase 3: User Story 1 — Transitive closer (Priority: P1)

**Goal**: One confirmed move closes an item's whole `part-of` subtree's recorded ids.
**Independent test**: cascade over a fixture parent+children closes the full deduped
id set; re-run is idempotent (quickstart Scenarios A, B, D).

- [X] T010 [P] [US1] RED: test the `CascadePlan` builder — walks the `part-of` subtree, collects terminal nodes' `closes:` ids, dedups multi-parent via visited-Set in `tests/roadmap/transitive-close-walk.test.ts` (placed under the collected `tests/**` root)
- [X] T011 [P] [US1] RED: test skip-and-report — a non-terminal child is listed in `skipped`, its ids excluded, the walk continues in `tests/roadmap/transitive-close-skip.test.ts`
- [X] T012 [P] [US1] RED: test uniform terminal handling — a `cancelled`/`retired` member's ids are collected with a status-reflecting reason; walk descends into its children in `tests/roadmap/transitive-close-uniform.test.ts`
- [X] T013 [P] [US1] RED: test `unknownIds` (recorded id absent from backlog) surfaces in the plan and apply refuses in `tests/roadmap/transitive-close-unknown.test.ts`
- [X] T014 [US1] Implement `transitive-close.ts` (CascadePlan builder + apply: walk, dedup, skip-and-report, uniform-terminal, unknownIds, idempotent close via `backend.close`) in `src/roadmap/transitive-close.ts` (GREEN T010–T013)
- [X] T015 [P] [US1] RED: test `close-related --cascade` dry-run lists the plan and writes nothing; `--apply` closes the deduped set; re-run reports `alreadyClosed` in `src/__tests__/terminal-closure/close-cascade.test.ts` (placed under the collected `src/__tests__/**` root)
- [X] T016 [US1] Add the `--cascade` flag to `emitCloseRelated` in `src/subcommands/roadmap.ts` driving `transitive-close` (engine arm extracted to `src/subcommands/roadmap-cascade-emit.ts` to hold roadmap.ts under the size cap; flag wired through scanner + grammar + commander mount + help) (GREEN T015)

**Checkpoint**: US1 independently testable against a hand-populated `closes:` fixture.

## Phase 4: User Story 2 — `closes:` population + auto-back-link (Priority: P1)

**Goal**: Record resolved ids on a node without hand-editing; closing/promoting a
task auto-back-links it. **Independent test**: quickstart Scenarios E, F.

- [X] T017 [P] [US2] RED: test `closes-mutation` add/remove — set-union/difference, canonical comma-list, create/remove the line (placed at `tests/roadmap/closes-mutation.test.ts` — the `src/roadmap/__tests__/` root is NOT vitest-collected)
- [X] T018 [US2] Implement `closes-mutation.ts` (add/remove ids in a node's prose `closes:`; dry-run/apply) in `src/roadmap/closes-mutation.ts` (GREEN T017)
- [X] T019 [P] [US2] RED: test the `roadmap resolves` verb (dry-run shows before→after; `--apply` writes; `add-edge` still refuses `closes`) at `src/__tests__/roadmap/roadmap-resolves.test.ts`
- [X] T020 [US2] Add the `resolves` verb to `src/subcommands/roadmap.ts` (grammar entry + `emitResolves` in `roadmap-resolves-emit.ts`) driving `closes-mutation`; registered across all four surfaces + ROADMAP_MEDIATION (GREEN T019)
- [X] T021 [P] [US2] RED: test the backlog task parent-node ref — set via `setParentNode`, read via raw-notes; absent ⇒ no-op at `tests/backlog/parent-node-ref.test.ts`
- [X] T022 [US2] Persist/read the optional parent-node ref (notes linkage line) in `src/backlog/parent-node.ts` (reuses backend `readNotes`/`edit({appendNotes})`) (GREEN T021)
- [X] T023 [P] [US2] RED: test auto-back-link — `backlog done` of a task with a parent-node ref adds its id to that node's `closes:`; no ref ⇒ no-op, no error at `src/__tests__/backlog-autobacklink.test.ts`
- [X] T024 [US2] Wire `done`/`promote` to auto-back-link via `closes-mutation` (`src/backlog/auto-backlink.ts`) + accept `--node` on `capture`/`promote` in `src/subcommands/backlog.ts` (GREEN T023)

**Checkpoint**: US2 independently testable; combined with US1, closure is near-zero-touch.

## Phase 5: User Story 3 — The post-ship terminal stage (Priority: P1)

**Goal**: `shipped` is no longer terminal; `closed` is reached only via the
operator-confirmed `advance --to closed`. **Independent test**: quickstart Scenarios
C, G, H.

- [X] T025 [P] [US3] RED: test phase-derivation maps status→phase BY NAME — `shipped`→`phase:shipped`, `closed`→`phase:closed`; the `shipped→last-phase` special-case is gone in `src/workflow/__tests__/phase-derivation-by-name.test.ts` (landed at `src/__tests__/workflow/phase-derivation-by-name.test.ts`, per the prior-phase tests/** placement deviation)
- [X] T026 [US3] Rework `src/workflow/phase-derivation.ts` to status→phase by-name; DELETE the `status === 'shipped' → last-phase` special-case (clean break, no fallback) (GREEN T025) — generalized to a pure by-name rule scoped to work-less terminal phases (`work: (none)`), removing the hardcoded `shipped || closed` enumeration + the "partial" comment
- [X] T027 [P] [US3] RED: test compass — `shipped → closed` is `on-course`; `closed` from a non-`shipped` phase is refused; `closed` is terminal in `src/workflow/__tests__/compass-closed.test.ts` (landed at `src/__tests__/workflow/compass-closed.test.ts`)
- [X] T028 [US3] Add the `shipped → closed` legitimacy + non-`shipped` refusal to `src/workflow/compass.ts` (GREEN T027) — the generic `computeVerdict` already produced the right verdicts; the only change was `['close', 'closed']` in `intent-vocabulary.ts` ALIAS_TO_PHASE (compass.ts unchanged)
- [X] T029 [P] [US3] RED: test `advance --to closed` — dry-run shows the cascade plan and changes nothing; `--apply` runs the cascade AND sets status `closed`; never auto-fires; refuses from non-`shipped` in `src/roadmap/__tests__/advance-to-closed.test.ts` (landed at `tests/roadmap/advance-to-closed.test.ts`)
- [X] T030 [US3] Add the `closed` arm to `advance` (drives `transitive-close`; dry-run/`--apply`; precondition `shipped`) in NEW `src/subcommands/roadmap-advance-closed.ts` + thin branch in `src/subcommands/roadmap.ts` (GREEN T029) — roadmap.ts kept at 499 lines
- [X] T031 [P] [US3] RED: test that status/session-start surface a `shipped` item as not-yet-closed with `closed` as the next move in `src/workflow/__tests__/shipped-not-terminal-surface.test.ts` (landed at `src/__tests__/workflow/shipped-not-terminal-surface.test.ts`)
- [X] T032 [US3] Ensure the workflow status/next surfaces the pending `closed` for `shipped` items (consume the by-name derivation) (GREEN T031) — `workflow next` already surfaced it generically; added a "legitimate next move" line to `emitStatus` driven by `legitimateNextPhase`

**Checkpoint**: US3 independently testable; the lifecycle surfaces + guards the close.

## Phase 6: User Story 4 — Deadlock prevention / install-agnostic invariant (Priority: P2)

**Goal**: No validation criterion on any stage; no `tasks.md`-resident validation
task governance waits on. **Independent test**: quickstart Scenario H.

- [ ] T033 [P] [US4] RED: test the install-agnostic invariant — no phase (incl. `closed`) carries a post-install/release validation entrance criterion in `src/workflow/__tests__/install-agnostic.test.ts`
- [ ] T034 [US4] Confirm/assert (no new criterion added) the invariant holds across `WORKFLOW.md` + `gate-eval`; document the structural deadlock-absence in the contract (GREEN T033)
- [ ] T035 [P] [US4] RED: test that an installation with no release step reaches `closed` with nothing blocking (fixture with no install config) in `src/workflow/__tests__/closed-no-install.test.ts`

## Phase 7: Polish & Cross-Cutting

- [ ] T036 [P] Add `--help` text for `close-related --cascade`, `resolves`, `advance --to closed` (uniform with sibling verbs)
- [ ] T037 [P] Verify every new/changed file ≤ 500 lines (SC-derived; refactor if any exceeds) across the feature's source files
- [ ] T038 OQ-4: add the operator-facing close surface — a `/stack-control:close` skill body (or release-tail wiring) that drives `advance --to closed` with the dry-run/confirm and the self-hosting "validate the installed plugin" prompt (skill body + verb, never a git hook); update `check-front-door` if a new fronted op is added
- [ ] T039 Run the quickstart scenarios A–H end-to-end against a fixture installation and record results (maps SC-001..SC-007)
- [ ] T040 [P] Update `templates/WORKFLOW.md` + any `--help`/skill docs that describe the lifecycle to mention the `closed` terminal phase (no rot-prone version specifics)

## Dependencies & order

- **Phase 2 (Foundational)** blocks Phase 3 (US1) and Phase 5 (US3).
- **US3 (advance --to closed)** depends on **US1 (transitive-close engine)**.
- **US2** is independent of US1/US3 (closes population); US1 is testable on a
  hand-populated `closes:` fixture, so US1 and US2 can proceed in parallel after
  Phase 2.
- **US4** depends on US3 (the terminal stage existing) for its invariant tests.
- **Polish** last.

## Parallel opportunities

- Phase 2: T002/T004/T006/T008 RED tests are all `[P]` (different files).
- After Phase 2: US1 (Phase 3) and US2 (Phase 4) can run in parallel.
- Within each story, the `[P]` RED tests for distinct files run together before
  their GREEN implementation tasks.

## MVP scope

- **MVP = US1 (Phase 3) on top of Foundational (Phase 2)**: the transitive closer
  over a hand-populated `closes:` — the "one mechanical move" core value (SC-001).
- Incremental: + US2 (zero-touch population) → + US3 (terminal-stage guard +
  surfacing) → + US4 (invariant tests) → Polish.

## Notes

- Tests-first is non-negotiable here (Constitution I); every GREEN task names the RED
  task(s) it satisfies.
- Clean break (no fallback): T026 DELETES the `shipped → last-phase` special-case.
- OQ-4 (the close skill's exact home) is resolved at T038; the engine work (T010–T032)
  does not depend on it.
