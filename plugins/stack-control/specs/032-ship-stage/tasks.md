# Tasks: ship-stage

**Feature**: `multi:feature/ship-stage` | **Spec dir**: `specs/032-ship-stage` | **Branch**: one long-lived `feature/stack-control`

**Inputs**: [plan.md](./plan.md), [research.md](./research.md) (R1–R7), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md).

**Discipline**: RED-first for EVERY behavior task (Constitution I — write the failing test, watch it fail for the right reason, then minimal impl). Files ≤500 lines; no `any`/`as`/`@ts-ignore`; `@/` imports. **Build as ONE unit** — every phase lands in a single delivery; the ordering below is for TDD/incremental construction, not partial shipping. All paths relative to `plugins/stack-control/`.

---

## Phase 1: Setup / refactor prerequisites

- [X] T001 Split `src/subcommands/workflow.ts` (433 lines) — extract the advance/transition wiring into `src/subcommands/workflow-advance.ts` (and re-export) so the file stays ≤500 before adding ship/backstop wiring (R7). Pure refactor: verify by running the existing `src/__tests__/workflow/*` suite green (no behavior change).
- [X] T002 [P] Confirm fixture helpers exist for an on-disk installation with a govern convergence record + a configurable roadmap node `status:`; if missing, add a shared test helper under `src/__tests__/workflow/_fixtures/` (used by foundation + backstop tests).

## Phase 2: Foundational — phase model + recorded-status derivation (R3) — BLOCKS all user stories

- [X] T003 RED: add `phase-derivation.test.ts` cases — `status-is shipped` derive holds iff recorded `status==shipped`; `phase:validating` derives from `status-is shipped` (NO marker-absence in the derive); there is **no** derived `phase:shipped`; `closed` stays by-name. Watch fail. (F1 resolution)
- [X] T004 Add the `status-is` member to `DERIVE_KINDS` in `src/workflow/workflow-types.ts` and parse it in `src/workflow/workflow-grammar.ts` (`parseDerive`). (FR-007)
- [X] T005 Implement the `status-is` derive in `src/workflow/phase-derivation.ts` (`deriveHolds`/`derivePhase`): `phase:validating` derives from `status-is shipped`; **DELETE** the old `phase:shipped` derivation entirely (clean break, no back-compat arm). The `validated` marker is NOT a derive input — it is the close gate only. (FR-006, FR-007, FR-018) → T003 green.
- [X] T006 RED: `phase-derivation.test.ts` — `merging` derives from `record-converged impl` AND `status≠shipped`; an item that is govern-converged but `in-flight` derives `merging` (not `shipped`). Watch fail → implement merging derivation → green. (FR-005)

## Phase 3: User Story 1 — Ship welds merge to recording shipped (P1)

**Goal**: `/stack-control:ship` opens PR → operator confirms CI green → merge → non-discretionarily fires `graduate`. **Independent test**: a govern-converged item through ship records `status: shipped` in one invocation (SC-001).

- [X] T007 RED: `src/__tests__/workflow/advance-graduate-at-merge.test.ts` — the `graduate` transition is `merging→validating`, gate `graduate-impl impl`, effects `roadmap-advance to=shipped; roadmap-reconcile; journal-append; commit` (commit last); firing it on a govern-converged item records `status: shipped` and derives phase `validating`. Watch fail.
- [X] T008 [US1] In `templates/WORKFLOW.md`: add `phase:merging` (work `stack-control:ship`, next `validating`); **DELETE `phase:shipped`**; rewire `transition:graduate` to `from: merging / to: validating` (effect `roadmap-advance to=shipped`) per `contracts/workflow-grammar-changes.md`. (`phase:validating` is added in T023; the WORKFLOW.md lands coherently as one unit.) (FR-005, FR-006) → T007 green.
- [X] T009 [US1] RED: `advance-graduate-at-merge.test.ts` — `workflow advance <item>` from `governing` (govern-converged) routes to `merging`; from `merging` fires `graduate`; the graduate gate refuses (exit 1) when `graduate-impl` unmet. Watch fail → wire in `src/subcommands/workflow-advance.ts` → green. (FR-001, FR-002)
- [X] T010 [US1] Author `skills/ship/SKILL.md` per `contracts/ship-skill.md`: compass precondition (`--intent ship`) → govern-converged check → open PR → operator-confirm CI green (FR-019) → merge → fire `graduate` (no skip/defer/shortcut branch) → push. (FR-001..004)
- [X] T011 [US1] RED: `src/__tests__/workflow/intent-vocabulary.test.ts` — `ship` is a phase-bearing intent mapping to the `merging`/`graduate` boundary; compass returns `ahead` (refuse) for an un-governed item. Watch fail → add `ship` intent in `src/workflow/intent-vocabulary.ts` → green. (FR-001)
- [X] T012 [US1] RED: `advance-graduate-at-merge.test.ts` — there is no advance path that records nothing after a merge (the weld): from `merging`, the only forward transition fires `graduate` (no skip variant). Assert no `--defer`/`--skip` flag exists on the ship/advance surface. Also assert `skills/execute/SKILL.md` does NOT auto-invoke/reference `ship` (FR-004 — ship is operator-invoked, not auto-chained from execute; analyze C1). Watch fail → enforce → green. (FR-003, FR-004)

## Phase 4: User Story 2 — Compass and close gate never disagree (P1)

**Goal**: derived phase == recorded status across the post-govern span. **Independent test**: TASK-445 reproduction no longer reproduces (SC-002).

- [X] T013 [US2] RED: `src/__tests__/workflow/coherence-no-divergence.test.ts` — for an item at each post-govern point (merging, shipped, validating), the compass-derived phase and the close gate's recorded-status read AGREE; specifically a govern-converged-but-`in-flight` item derives `merging` (not `shipped`) and `roadmap advance --to closed` refuses — no graduated-but-status-in-flight window. Watch fail.
- [X] T014 [US2] Make it green via the Phase-2 derivation (merging/validating key on recorded status; `validated` is the close gate); confirm `roadmap-advance-closed.ts` close precondition (`status==shipped`) and the derived phase share the recorded-status source. Also assert the `graduate`/record-shipped path makes NO GitHub-remote call (SC-006/FR-013 — on-rail recording is remote-independent; analyze C2). (FR-007, FR-008, FR-013, SC-006)
- [X] T015 [US2] Update 031 fixtures/tests asserting the OLD `phase:shipped` (derive `record-converged impl`) or the `shipped→closed` edge for the clean break — `src/__tests__/workflow/shipped-not-terminal-surface.test.ts`, `compass-closed.test.ts`, `phase-derivation-by-name.test.ts`, et al. (`shipped` is now a status; the post-merge phase is `validating`.) No back-compat arm retained. (FR-018)

## Phase 5: User Story 3 — Backstop catches an off-rail merge (P2)

**Goal**: refuse forward motion on any merged-but-status-in-flight item; reconcile exempt; advisory-only at session skills. **Independent test**: SC-003, SC-004.

- [X] T016 [US3] RED: `src/__tests__/session/git-reachable.test.ts` — a new git helper `isReachableFromBase(commit, cwd)` returns true iff `<commit>` is an ancestor of the resolved base (`origin/main`); false when not; null/false when base undeterminable. Watch fail → add helper in `src/session/git.ts` (reuse `resolveBase`) → green. (FR-012)
- [X] T017 [US3] RED: `src/__tests__/workflow/merge-signal.test.ts` — `mergedButInFlight(item,...)` returns the item when its `impl` convergence record commit is reachable from base AND `status∉{shipped,closed}`; null when record absent / not reachable / status shipped / base undeterminable. Watch fail → implement `src/workflow/merge-signal.ts` → green. (FR-012, FR-013)
- [X] T018 [US3] RED: `src/__tests__/workflow/compass-backstop.test.ts` — `computeVerdict` returns a refusing verdict naming the dangling item + reconcile command when `danglingMergedItem` set; ALLOWS the reconcile intent for that item; on-course when none dangling. Watch fail → add `danglingMergedItem` to `computeVerdict` in `src/workflow/compass.ts` → green. (FR-009, FR-010)
- [X] T019 [US3] Wire `compass-resolve.ts` to call `merge-signal.ts` over the roadmap and pass `danglingMergedItem` into `computeVerdict`; surface the refusal in `workflow compass` CLI (`workflow-advance.ts`/`workflow.ts`). (FR-009)
- [X] T020 [US3] RED: `src/__tests__/workflow/session-advisory-nonblocking.test.ts` — `session-start` and `session-end` complete (exit 0) with a dangling item present AND surface a `mergedNotShippedItems` advisory; they NEVER refuse. Watch fail. (FR-011, SC-004)
- [X] T021 [US3] Add the non-blocking advisory: `mergedNotShippedItems` on `OrientationReport` (`src/session/orient.ts` + `report.ts`) and on `SessionEndReport` (`src/subcommands/session-end.ts`); populate via `merge-signal.ts`; surface only (never block). (FR-011) → T020 green.

## Phase 6: User Story 4 — Adopter-defined validating before close (P2)

**Goal**: `shipped→validating→closed` with operator-confirm `validated` default; adopter-overridable. **Independent test**: SC-005.

- [X] T022 [US4] RED: `src/__tests__/workflow/validating-phase.test.ts` — bundled `WORKFLOW.md` has `phase:validating` between shipped and closed; `transition:close` is `validating→closed` with exit-gate `approval-marker validated`; a shipped item without `validated` cannot close; with it, closes. Watch fail.
- [X] T023 [US4] Add `phase:validating` + rewire `transition:close` (`validating→closed`, gate `approval-marker validated`) in `templates/WORKFLOW.md` per `contracts/workflow-grammar-changes.md`; confirm `gate-eval.ts` evaluates `approval-marker validated` (generic kind, no new code) and `roadmap-advance-closed.ts` honors the gate. (FR-014) → T022 green.
- [X] T024 [US4] RED: `validating-phase.test.ts` — an installation override at `.stack-control/WORKFLOW.md` changing `validating`'s exit criteria is honored over the bundled default (no engine change). Watch fail → confirm/extend override resolution (`loadWorkflowDoc`) → green. (FR-015, FR-016)

## Phase 7: Polish & cross-cutting

- [X] T025 [P] Add `start-merging` (governing→merging) and `validate` (shipped→validating) transition blocks to `templates/WORKFLOW.md` if modeled as explicit transitions (per data-model.md); RED-first in `workflow-grammar.test.ts`. (FR-005)
- [X] T026 [P] Audit file sizes — `workflow.ts`/`workflow-advance.ts`, `phase-derivation.ts`, `compass*.ts`, `session-end.ts` all ≤500; refactor if any exceeded. (Constitution VI)
- [X] T027 [P] Verify quickstart scenarios SC-001..SC-007 run as written against a fixture installation; fix any drift between `quickstart.md` and the implemented verbs.
- [X] T028 Run the full suite (`npx vitest run`) green; confirm bundled `templates/WORKFLOW.md` parses (no malformed-doc fail-loud) via a `workflow status` smoke. (SC-007)
- [X] T029 [P] Update `THESIS.md`/`DESKWORK-STATE-MACHINE.md` only if the lifecycle-phase change touches a documented commandment (the `merging`/`validating` phases) — keep the canonical state-machine doc in sync in the same delivery.

---

## Dependencies & ordering

- **Phase 1 (T001–T002)** before all (the split unblocks safe edits to workflow wiring).
- **Phase 2 (T003–T006)** is foundational — BLOCKS Phases 3–6 (every story depends on the recorded-status derivation).
- **US1 (P1)** and **US2 (P1)** are the coherence core; US2 largely falls out of Phase 2 + US1 (T014 is mostly assertion + 031 fixture updates T015).
- **US3 (P2)** and **US4 (P2)** are independent of each other; both depend on Phase 2 (and US1 for the recorded `status: shipped`).
- **Phase 7** last.

## Parallel opportunities

- T002, then within Phase 2 the test-authoring (T003, T006) can be drafted in parallel before impl.
- Across stories once Phase 2 is green: US3 (T016–T021) and US4 (T022–T024) touch disjoint files (`merge-signal.ts`/`compass*.ts`/`session*` vs `WORKFLOW.md` validating block) — parallelizable.
- Polish T025/T026/T027/T029 are [P].

## MVP scope

US1 + US2 (the weld + the coherence fix) is the minimum that resolves the motivating defect (merged-but-status-in-flight). US3 (backstop) + US4 (validating) complete the one-unit delivery and MUST ship together per FR-018 — they are not a separate release.

## Mapping

- US1 → FR-001..004, FR-019, SC-001 · US2 → FR-006..008, FR-018, SC-002 · US3 → FR-009..013, FR-017, SC-003/004/006 · US4 → FR-014..016, SC-005 · Polish → SC-007.
