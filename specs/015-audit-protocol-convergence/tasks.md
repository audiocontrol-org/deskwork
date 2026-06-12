# Tasks: Audit-protocol convergence correctness + incremental audit units

**Input**: Design documents from `specs/015-audit-protocol-convergence/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D8), data-model.md, contracts/ (cluster-severity, convergence-loop, incremental-audit)

**Tests**: INCLUDED — TDD is NON-NEGOTIABLE (Constitution Principle I). Every behavior lands RED-first (a failing Vitest seen failing for the expected reason) before the implementing change.

**Organization**: grouped by user story (US1–US6 from spec.md), in priority order. All paths are under `plugins/stack-control/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6; Setup/Foundational/Polish carry no story label

## Path Conventions

- Source: `plugins/stack-control/src/`
- Tests: `plugins/stack-control/src/__tests__/`
- Config templates: `plugins/stack-control/templates/`
- Run tests: `npm --workspace @deskwork/plugin-stack-control test`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: fixtures the RED-first suites need; no project scaffolding (in-tree plugin already exists).

- [X] T001 [P] Add a fixture audit-log replaying the 014 rounds-4–7 finding stream (one cluster per round: `[{opus,high},{codex,medium}]`) under `plugins/stack-control/src/__tests__/fixtures/convergence/rounds-4-7-audit-log.md`
- [X] T002 [P] Add a fixture multi-phase `tasks.md` tree (≥2 phases with distinct file scopes) under `plugins/stack-control/src/__tests__/fixtures/convergence/multi-phase-feature/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: shared types consumed by US1, US2, US4. MUST complete before those stories.

- [X] T003 Define `PerLaneSeverity` and `ClusterSeverityDecision` types (per data-model.md) in `plugins/stack-control/src/scope-discovery/promote-findings/cluster-severity-types.ts`
- [X] T004 Define `AuditUnit` + `DiffScope` types in `plugins/stack-control/src/govern/audit-unit-types.ts`
- [X] T005 Define the `ConvergenceOutcome` discriminated union (`converged | overridden | non-converged`) in `plugins/stack-control/src/govern/convergence-types.ts`

---

## Phase 3: User Story 1 — Convergence reaches a clean stop instead of plateauing (P1) 🎯 MVP

**Goal**: replace max-of-cluster severity with ≥2-lane agreement + adjudication so the dampener's two-consecutive-raw-0-HIGH branch becomes reachable (threads 1A/1C; FR-001/002/003).

**Independent test**: replay the rounds-4–7 stream (T001) through the lift + dampener and confirm clusters gate-count `medium` and the dampener engages — where max-of-cluster left it disengaged (SC-001 at the gate level).

- [X] T006 [P] [US1] RED: unit tests for `computeClusterSeverity` covering every invariant in `contracts/cluster-severity.md` (`[high,medium]→medium`, `[high,high]→high`, `[high,medium,medium]→medium`, `[blocking,high]→high`, single `[high]→high`, never-raise) in `plugins/stack-control/src/__tests__/scope-discovery/promote-findings/cluster-severity.test.ts`
- [X] T007 [US1] Implement `computeClusterSeverity` (agreement rule, single-model passthrough) in `plugins/stack-control/src/scope-discovery/promote-findings/cluster-severity.ts` — make T006 green
- [X] T008 [P] [US1] RED: unit tests for `adjudicate` (single-lane HIGH + "currently unreachable" + fix-debt → ≤medium with non-empty basis; reachable data-loss HIGH → stays high) in `plugins/stack-control/src/__tests__/scope-discovery/promote-findings/adjudicate-findings.test.ts`
- [X] T009 [US1] Implement `adjudicate` (blast-radius/reachability/fix-debt re-score, mandatory basis) in `plugins/stack-control/src/scope-discovery/promote-findings/adjudicate-findings.ts` — make T008 green
- [X] T010 [US1] RED: test that `extractBarrageFindings` populates `perLaneSeverities` + `severityDecision` and sets `severity = gateCountedSeverity` (not max), AND that `crossModelAgreement` stays `sourceModels.length>=2` independent of the de-inflated severity (FR-003 orthogonality) in `plugins/stack-control/src/__tests__/scope-discovery/promote-findings/extract-barrage-findings.test.ts`
- [X] T011 [US1] Modify `mergeCluster` in `plugins/stack-control/src/scope-discovery/promote-findings/extract-barrage-findings.ts` to delegate severity to `computeClusterSeverity` + route residuals through `adjudicate`; add `perLaneSeverities`/`severityDecision` to `ExtractedFinding` — make T010 green
- [X] T012 [US1] RED: test the lift persists the gate-counted `Severity:` line + the per-lane breakdown + `rule` (+ basis) to the audit-log (FR-002 / SC-002) in `plugins/stack-control/src/__tests__/scope-discovery/audit-barrage/audit-barrage-lift.test.ts`
- [X] T013 [US1] Modify `plugins/stack-control/src/subcommands/audit-barrage-lift.ts` to write the per-lane breakdown + decision alongside the unchanged `Severity:` line — make T012 green
- [X] T014 [US1] RED→GREEN integration: feed the rounds-4–7 fixture (T001) through lift→dampener and assert the dampener engages (gate OPEN) where max-of-cluster left it BLOCKED (SC-001) in `plugins/stack-control/src/__tests__/govern/convergence-sc001.test.ts`

**Checkpoint**: severity de-inflation works; a genuine ≥2-lane HIGH still blocks (SC-003 asserted in T006).

---

## Phase 4: User Story 2 — Loop termination is enforced by code, not agent discretion (P1)

**Goal**: lift the convergence loop out of skill prose into a code driver owning iterate/stop + the ceiling (004 FR-014, the per-checkpoint iteration ceiling — not a 015 requirement) (thread 2; FR-004/005).

**Independent test**: drive `runConvergenceLoop` with a stub gate across all branches and confirm deterministic termination with no agent decision (SC-004).

- [X] T015 [P] [US2] RED: unit tests for `runConvergenceLoop` per `contracts/convergence-loop.md` (OPEN-pass-1→converged/0 fixes; always-BLOCKED ceiling 5→non-converged/4 fixes; BLOCKED×2→converged/2 fixes; override→overridden), AND that the driver itself writes nothing to the audited tree — `dispatchFix` is the only mutation seam (FR-005 no-auto-edit) in `plugins/stack-control/src/__tests__/govern/convergence-loop.test.ts`
- [X] T016 [US2] Extract the single `render→barrage→lift→slush→gate` pass in `plugins/stack-control/src/govern/protocol.ts` behind a step API the driver can call (no behavior change to the pass)
- [X] T017 [US2] Implement `runConvergenceLoop` (rounds, ceiling, override short-circuit, `ConvergenceOutcome`) in `plugins/stack-control/src/govern/convergence-loop.ts` — make T015 green
- [X] T018 [US2] Modify `plugins/stack-control/src/subcommands/govern.ts` to delegate the loop to `runConvergenceLoop` (build `runPass`/`dispatchFix`/`ceiling`; map outcome→exit) — the agent no longer holds the re-run decision
- [X] T019 [US2] Update the govern skill body (`plugins/stack-control/skills/*govern*/SKILL.md` / spec-kit `deskwork-governance` command prose) to remove the "re-run until clean" prose loop and point at the code driver — enforcement lives in the verb, not prose
- [X] T020 [US2] RED→GREEN integration: `govern` over a stub feature reaches a recorded terminal (converged/non-converged) with no agent-held loop step (SC-004 end-to-end) in `plugins/stack-control/src/__tests__/govern/govern-loop-driver.test.ts`

**Checkpoint** (MVP complete): convergence is mechanically correct (US1) AND mechanically bounded (US2).

---

## Phase 5: User Story 3 — Barrage does not audit its own findings or parked scaffolds (P2)

**Goal**: remove the self-referential generator from the rendered payload (thread 3; FR-006).

**Independent test**: render the implement payload for a feature with a populated audit-log + a parked untracked scaffold; confirm both are excluded (SC-005).

- [X] T021 [P] [US3] RED: test the rendered payload contains zero bytes of the feature's own audit-log content and excludes an unrelated untracked parked scaffold while folding an in-scope untracked file (SC-005) in `plugins/stack-control/src/__tests__/govern/payload-exclusion.test.ts`
- [X] T022 [US3] Modify `plugins/stack-control/src/govern/payload-implement.ts` to drop the `audit_log_excerpt` fold from the audited material and bound the untracked fold to the unit's path scope — make T021 green

**Checkpoint**: the convergence loop (US1/US2) now runs on real signal, not self-reference.

---

## Phase 6: User Story 4 — Work is audited in smaller per-phase units (P2)

**Goal**: a completed tasks.md phase is an audit unit; whole-feature governance composes from converged phases (thread 4; FR-007/008/009).

**Independent test**: resolve one phase of the multi-phase fixture (T002) to a diff-scoped unit and confirm the payload is phase-scoped, governed by the same loop (SC-006).

- [ ] T023 [P] [US4] RED: tests for `resolvePhaseUnit` (diff-scope is one phase's files only; SC-006), `resolveComposingFeatureUnit` (excludes converged-unchanged phases, includes changed/cross-cutting), AND that a phase unit appends its findings to the same per-feature audit-log section as whole-feature governance (FR-008 same store) in `plugins/stack-control/src/__tests__/govern/incremental-audit.test.ts`
- [ ] T024 [US4] Implement `resolvePhaseUnit` + `resolveComposingFeatureUnit` (tasks.md `## Phase N` grammar → `AuditUnit`) in `plugins/stack-control/src/govern/incremental-audit.ts` — make T023 green
- [ ] T025 [US4] Wire an `AuditUnit`-scoped invocation through `protocol.ts`/`govern.ts` so a phase unit flows the same `runConvergenceLoop` path as a feature unit (FR-007); add a `--phase <id>` selector to the govern verb
- [ ] T026 [US4] RED→GREEN: assert a per-phase payload's derived timeout for the slowest admitted lane is < the whole-feature payload's, and the watchdog/terminal-state path is unchanged (FR-009) in `plugins/stack-control/src/__tests__/scope-discovery/audit-barrage/per-phase-timeout.test.ts`

**Checkpoint**: incremental units shrink payload, findings/round, and fix-debt — feeding the convergence gains from US1.

---

## Phase 7: User Story 5 — Re-evaluate and admit sonnet on the smaller units (P3)

**Goal**: re-calibrate sonnet on per-phase payloads under plan-mode; admit to an operator-selectable override profile when it meets the bar (thread 5; FR-011).

**Independent test**: hostile-write-probe sonnet under `--permission-mode plan`; record latency/depth/on-task vs the bar; record the decision (SC-007).

- [ ] T027 [P] [US5] RED: reuse the 014 hostile-write-probe harness to assert a sonnet spawn under `--permission-mode plan` produces zero new files / zero commits / zero pushes (SC-007) in `plugins/stack-control/src/__tests__/scope-discovery/audit-barrage/sonnet-readonly-probe.test.ts`
- [ ] T028 [US5] Run the sonnet calibration experiment on a representative per-phase payload (latency vs derived timeout, finding depth, on-task) and record the evidence in `specs/015-audit-protocol-convergence/quickstart-results.md` (experiment artifact, not production code — Constitution I)
- [ ] T029 [US5] Add the sonnet override-profile lane (commented, mirroring the fable thoroughness override) to `plugins/stack-control/templates/audit-barrage-config.yaml` with the recorded admit/reject decision + evidence reference

**Checkpoint**: model diversity restored cheaply on small units, or sonnet recorded-rejected with evidence — either way no silent fleet change.

---

## Phase 8: User Story 6 — Guard the already-fixed raw-counting against regression (P3)

**Goal**: pin the #432 raw-counting (Facet A is already fixed; this prevents its silent reversion; FR-010).

**Independent test**: a slushed-MED run does not engage branch (a); a fixed-HIGH run does not count 0-HIGH for branch (b); mutation to open-count goes RED (SC-008).

- [ ] T030 [P] [US6] RED: regression test for `checkBarrageDampener` raw counting (slushed MED still counts against branch (a); fixed HIGH still non-0-HIGH for branch (b)) in `plugins/stack-control/src/__tests__/scope-discovery/promote-findings/dampener-raw-counting.test.ts`
- [ ] T031 [US6] Confirm the test passes against the current code unchanged AND fails under a mutation that reverts raw→open counting (record the mutation check in the test file comment) — SC-008

---

## Phase 9: Polish & Cross-Cutting

- [ ] T032 [P] Verify every touched/new file is within the 300–500 line cap; split if `extract-barrage-findings.ts` or `protocol.ts` exceeded it (Constitution VI)
- [ ] T035 [P] Guard the isolation constraint (FR-012): assert no `plugins/dw-lifecycle/` path was modified by this feature's diff (the dw-lifecycle barrage copy stays untouched — succession isolation)
- [ ] T033 [P] Roadmap/backlog hygiene: close TASK-18 Facet A (resolved + guarded), link TASK-27 / #431 / the adjudication inbox capture to this feature, and add the `multi/audit-protocol-convergence` roadmap item in `plugins/stack-control/ROADMAP.md`
- [ ] T034 Run the full suite green (`npm --workspace @deskwork/plugin-stack-control test`) and the SC-001..008 quickstart runbook; record results in `specs/015-audit-protocol-convergence/quickstart-results.md`

---

## Dependencies

- **Phase 2 (T003–T005)** blocks US1, US2, US4 (shared types).
- **US1 (T006–T014)** and **US2 (T015–T020)** are the MVP; in code they touch mostly different modules, BUT US1's SC-001 gate test (T014) only proves the *signal* is correct, and US2 proves the *loop acts on it* — they compose. US2's T016/T018 touch `protocol.ts`/`govern.ts`, which **US4's T025 also touches** — sequence those edits, don't parallelize across US2/US4 on those two files.
- **US3 (T021–T022)** is independent (only `payload-implement.ts`); can land any time after Phase 2.
- **US4 (T023–T026)** depends on US2's step-API extraction (T016) for the shared loop path.
- **US5 (T027–T029)** depends on US4 (needs the per-phase payload to calibrate against).
- **US6 (T030–T031)** is fully independent — can land any time.
- **Phase 9** last.

## Parallel Execution Examples

- **Setup**: T001 ∥ T002 (different fixture files).
- **After Phase 2**: US1 unit tests (T006, T008) ∥ each other; US6 (T030) ∥ everything; US3 (T021) ∥ US1.
- **Within US1**: T006/T008 (tests) parallel; implementations T007→T011→T013 sequential (same/dependent files).
- Do NOT parallelize T016/T018 (US2) with T025 (US4) — both edit `protocol.ts`/`govern.ts`.

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + US1 + US2** (both P1): convergence is mechanically *correct* (severity de-inflation) AND mechanically *bounded* (code loop driver) — the two defects that made the 014 loop need operator override. Ship this first; it stands alone.

Then **US3** (clean the payload) and **US4** (shrink the unit) compound the convergence gains. **US5** (sonnet) and **US6** (regression guard) are P3 hardening. Commit + push at every task boundary (Constitution VII); every fix found mid-way is scoped in, TDD-first.
