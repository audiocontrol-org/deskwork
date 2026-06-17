# Tasks: Un-skippable workflow protocol

**Feature**: `specs/025-unskippable-workflow-protocol/` | **Branch**: `feature/stack-control`

**Tests**: TDD mandatory (Constitution I — Test-First NON-NEGOTIABLE). Every behavior lands RED→GREEN; each contract's "test obligations" are the RED tests.

**Note on phases**: Each user-story phase below is sized to be a single `govern --phase`
boundary within the model fleet envelope — this feature dogfoods its own US2 per-phase
cadence during implementation. Authoritative file lists are given per task so the FR-004
phase-enumeration gate (and TASK-70) has the inputs it needs.

## Format: `[ID] [P?] [Story] Description with file path`

- **[P]**: parallelizable (different files, no incomplete dependency).
- **[USn]**: user-story phase tasks only.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Inventory the existing 021/022/024 primitives this feature wires (per-phase checkpoint reader + scope fingerprint in `src/govern/`, gate-eval criterion kinds in `src/workflow/gate-eval.ts`, the `record-converged`/`node-marker` readers, the `WORKFLOW.md` grammar in `src/workflow/workflow-grammar.ts`) and record the exact extension points in `specs/025-unskippable-workflow-protocol/research.md` (append an "Implementation anchors" subsection). No behavior change.
- [x] T002 [P] Add a multi-phase test-fixture builder (a feature with N `tasks.md` phases, per-phase file lists, and writable per-phase checkpoints) in `src/__tests__/fixtures/workflow/unskippable-fixtures.ts`, reusing the existing workflow fixtures.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: phase enumeration + file-list resolution is shared by the US1 gate and the US2 cadence; it must exist (and fail loud) before either.

- [x] T003 [US-shared] RED: test that phase enumeration derives the phase set from `tasks.md` phase headers, and FAILS LOUD naming the phase when a phase has no authoritative file list (FR-004) — in `src/__tests__/workflow/phase-enumeration.test.ts`.
- [x] T004 [US-shared] Implement phase enumeration + authoritative-file-list resolution (fail-loud, no partial/empty payload) in `src/workflow/phase-enumeration.ts`; key off `tasks.md` headers. Document the TASK-70 dependency inline (reference the backlog id, not a "for now" comment).
- [x] T005 [US-shared] RED+GREEN: zero-derivable-phases → FATAL (not trivially met) covered by the same test file.

**Checkpoint**: phase enumeration available + fail-loud; US1/US2 can proceed.

---

## Phase 3: User Story 1 - Per-phase governance is a gated boundary (Priority: P1) 🎯 MVP

**Goal**: graduate/`implementing→governing` require a current per-phase checkpoint for every phase; the whole-feature signal is composed from the checkpoint union (no whole-feature govern run).

**Independent test**: on a 3-phase fixture, the gate refuses until all 3 checkpoints are current; editing a phase reopens it (quickstart Scenario A/B).

### Tests (RED first)

- [x] T006 [P] [US1] Contract test for `graduate-gate.md`: 2/3 checkpoints → unmet naming phase 3; all current → met; phase-2 edit → unmet naming phase 2 (stale); standalone whole-feature record alone → unmet — in `src/__tests__/workflow/graduate-gate.test.ts` (SC-001/SC-002, FR-001/003).
- [x] T007 [P] [US1] Test that the composed graduate signal derives from the checkpoint union and that NO whole-feature payload is assembled (FR-001a) — in `src/__tests__/workflow/composed-record.test.ts`.

### Implementation

- [x] T008 [US1] Add the `all-phase-checkpoints-current` criterion kind to the gate-eval criterion type + evaluator in `src/workflow/gate-eval.ts` (uses Phase-2 enumeration; staleness via 021 fingerprints).
- [x] T009 [US1] Implement the composed-record reader (derive `record-converged impl` from the per-phase checkpoint union; no whole-feature govern) in `src/govern/compose-convergence.ts`.
- [x] T010 [US1] Wire the new criterion into `templates/WORKFLOW.md` on `graduate` (`governing→shipped`) and `start-governing` (`implementing→governing`), with the phase set each evaluates (FR-001/FR-002/FR-005). Cite the spec in the commit.
- [x] T011 [US1] Update the `WORKFLOW.md` grammar/parse support in `src/workflow/workflow-grammar.ts` if the criterion needs a new target symbol; add a grammar test in `src/__tests__/workflow/workflow-grammar.test.ts`.

**Checkpoint**: US1 gate fully functional + independently testable (the MVP — batching can no longer graduate).

---

## Phase 4: User Story 2 - `execute` fires per-phase govern at each boundary (Priority: P1)

**Goal**: `execute` runs `govern --phase <id>` at each phase boundary and refuses phase N+1 until phase N is current; oversized single phase fails loud to TASK-75.

**Independent test**: drive execute over the 3-phase fixture; a current checkpoint exists after each phase before the next begins; phase-1 missing → refuse phase 2 (quickstart Scenario C 1–2, 4).

### Tests (RED first)

- [x] T012 [P] [US2] Contract test for `execute-cadence.md` (govern half): checkpoint exists after each phase before next begins; phase-1 missing → refuse phase 2; oversized phase → FATAL `boundary-too-large` pointing at TASK-75, no auto-split — in `src/__tests__/subcommands/execute-cadence-govern.test.ts` (SC-003/SC-006, FR-006/007/008).

### Implementation

- [x] T013 [US2] Implement the per-phase govern post-condition in `src/subcommands/execute-check.ts` (fire `govern --phase <id>` at each boundary; refuse N+1 until N current — reuse 021's govern-time ordering).
- [x] T014 [US2] Implement the oversized-single-phase fail-loud path (`boundary-too-large` → point at TASK-75; never auto-split) in `src/subcommands/execute-check.ts`.
- [x] T015 [US2] Update `skills/execute/SKILL.md` to document the non-discretionary per-phase govern cadence (skill-body post-condition, not agent choice; FR-006). No skip/defer affordance (ties US5).

**Checkpoint**: per-phase govern fires automatically; boundary-too-large is a non-event on the sanctioned path.

---

## Phase 5: User Story 3 - Commit-and-push is mechanical at each boundary (Priority: P1)

**Goal**: commit-local-first then push at each boundary; push failure fails loud, commit intact, never `--no-verify`.

**Independent test**: each boundary produces a commit + push; simulated push failure surfaced loud with local commit intact (quickstart Scenario C 3).

### Tests (RED first)

- [x] T016 [P] [US3] Contract test for `execute-cadence.md` (commit/push half): commit lands locally first; push follows; simulated push failure → surfaced loud, commit intact, no `--no-verify` — in `src/__tests__/subcommands/execute-cadence-push.test.ts` (SC-003/SC-007, FR-009/010/011).

### Implementation

- [x] T017 [US3] Implement the commit-then-push boundary post-condition (commit-local-first; push fail-loud; never `--no-verify`) in `src/subcommands/execute-check.ts`.
- [x] T018 [US3] Update `skills/execute/SKILL.md` to document the mechanical commit/push cadence (Principle VII as mechanism, not reminder).

**Checkpoint**: commit/push automatic at each boundary; no operator reminder required.

---

## Phase 6: User Story 4 - No bypassing the front doors (speckit wrapper) (Priority: P2)

**Goal**: a direct invocation of any wrapped backend skill (specify/plan/tasks/implement) is refused and redirected to its front door; front-door invocations are not refused; evaded raw path still cannot graduate.

**Independent test**: invoke each wrapped skill directly → refused with redirect; front-door invocation → not refused (quickstart Scenario D).

> **CORRECTED 2026-06-16 (operator decision)**: the original `.claude/skills/speckit-*`
> precondition-block injection is invalid (adopter's own Spec Kit, not plugin-controlled;
> `.claude/skills/` is Claude-only). US4 ships a portable `stackctl` refusal verb + the
> cross-vendor command/skill adapters; the US1 gate is the real teeth. Cross-vendor
> point-of-invocation interception is the filed follow-on
> `design:gap/speckit-bypass-point-of-invocation-refusal`. See spec.md Clarifications +
> contracts/speckit-wrapper.md.

### Tests (RED first)

- [x] T019 [P] [US4] Contract test for `speckit-wrapper.md`: the refusal map redirects each of specify/plan/tasks/implement to its correct front door; a front-door-marked invocation is NOT refused (no false positive) — in `src/__tests__/speckit-wrapper/wrapper-refusal.test.ts` (SC-004, FR-012).

### Implementation

- [x] T020 [US4] Implement the portable refusal/redirect map (skill-identity → front-door, never vendor identity; pure function, no host/fs dependency) in `src/speckit-wrapper/refusal.ts`; expose the front-door-marker check. Wire a `stackctl` verb that surfaces it.
- [x] T021 [US4] Expose the refusal/redirect through the plugin's cross-vendor command/skill adapters (`commands/*.md` + a `skills/*/SKILL.md` note) so it travels with `claude plugin install` AND surfaces under Codex. Use bare `stackctl` (PATH), never `plugins/stack-control/bin/stackctl` (GitHub #480). NO injection into the adopter's `.claude/skills/` (FR-013/018).
- [x] T022 [US4] Document (quickstart Scenario D + the wrapper docs) that 025 ships the portable refusal + US1-gate teeth, and that cross-vendor point-of-invocation interception is the filed follow-on `design:gap/speckit-bypass-point-of-invocation-refusal` (honest-boundary note, FR-017).
- [x] T023 [US4] Cross-link the defense-in-depth test: an evaded raw implement cannot graduate (reuses the Phase-3 graduate-gate test) — add the assertion reference in `src/__tests__/speckit-wrapper/wrapper-refusal.test.ts` (FR-014).

**Checkpoint**: the backend chain is refused/redirected at the stack-control surface (cross-vendor) + cannot graduate raw (US1 gate).

---

## Phase 7: User Story 5 - No agent-offered shortcuts (Priority: P2)

**Goal**: zero skip/defer/shortcut affordances in any stack-control skill body; the audit catches regressions.

**Independent test**: the skill-body audit reports zero affordances across all stack-control skills (quickstart Scenario E).

### Tests (RED first)

- [x] T024 [P] [US5] Test the shortcut-affordance audit: it flags a seeded skill body containing a "defer this step?" phrase and passes on a clean tree — in `src/__tests__/workflow/no-shortcuts-audit.test.ts` (SC-005, FR-015).

### Implementation

- [x] T025 [US5] Implement the shortcut-affordance audit (phrase scan over `skills/*/SKILL.md`) in `src/subcommands/no-shortcuts-audit.ts` (or fold into the doctor surface); enumerate the prohibited phrasings.
- [x] T026 [US5] Audit + remediate existing stack-control skill bodies: remove any skip/defer/shortcut affordance; ensure operator-facing branches are operator-initiated scope decisions only (FR-016). List touched files in the commit.

**Checkpoint**: no agent-offered protocol bypass anywhere; audited.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T027 [P] Confirm enforcement-home invariant across the diff: all new enforcement is in `templates/WORKFLOW.md` + skill bodies + CLI verbs; nothing in `.husky/`/`.git/hooks/` (FR-018). Add a one-line audit note.
- [x] T028 [P] File-size guard: ensure `src/subcommands/execute-check.ts` and `src/workflow/gate-eval.ts` stay within 300–500 lines (Principle VI); refactor if the cadence + criterion work pushes them over (watch the pre-existing `payload-implement.ts` cap, TASK-48).
- [x] T029 [P] Honest-boundary doc note (FR-017): the mechanism binds an agent following the skills; a raw human bypass is not claimed prevented — surfaced in `skills/execute/SKILL.md` and the wrapper docs.
- [x] T030 Run the full vitest suite + `stackctl spec-check`; confirm all RED tests are GREEN and the quickstart scenarios pass.

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **BLOCKS US1 and US2** (phase enumeration is shared).
- **US1 (Phase 3, MVP)**: after Foundational. The keystone — also the defense-in-depth for US4.
- **US2 (Phase 4)**: after Foundational; uses US1's checkpoint currency notion but is independently testable.
- **US3 (Phase 5)**: after Foundational; touches the same `execute-check.ts` as US2 (sequence US2 before US3 to avoid file churn — NOT parallel with US2).
- **US4 (Phase 6)**: after Foundational; independent of US2/US3; references US1 for defense-in-depth.
- **US5 (Phase 7)**: independent; can run after Foundational.
- **Polish (Phase 8)**: after all desired stories.

### Parallel opportunities

- T002 (fixtures) ∥ T001 (inventory).
- Within a story, the `[P]` test tasks precede implementation.
- US4 and US5 can proceed in parallel with US2/US3 (different files), EXCEPT US2 and US3 both edit `execute-check.ts` (serialize US2 → US3).

## Implementation strategy

- **MVP = US1** (Phase 3): the per-phase graduate gate alone makes batch-then-graduate impossible and gives US4 its defense-in-depth. Ship/govern US1 first.
- Then US2 + US3 (the execute cadence that writes the checkpoints the US1 gate reads), then US4 + US5.
- Each phase is a `govern --phase` boundary: govern + commit + push at each checkpoint (the feature exercises its own US2/US3 cadence during its own implementation).
