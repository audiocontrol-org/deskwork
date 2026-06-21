# Tasks: govern-operability

**Input**: Design documents from `specs/029-govern-operability/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)
**Tests**: TDD-first (Constitution Principle I) — each phase lands a RED test before its implementation.
**Organization**: Phases 1–9 map 1:1 to user stories US1–US9 in sharpen-the-saw build order, so `stackctl govern --phase N` aligns with `## Phase N`. Phase 10 is polish + feature completion.

## Format: `[ID] [P?] [Story] Description with file path`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[USn]**: the user story the task serves
- All paths are installation-relative (`plugins/stack-control/`). Strict typing (no `any`/`as`/`!`/`@ts-ignore`); `@/` imports with `.js`; files under 300–500 lines; no fallbacks outside tests.

## Conventions

- Do NOT re-implement specs/015 (convergence loop) or specs/021 (hardening) — extend their surfaces only.
- Each phase ends by closing the backlog tasks it resolves (`stackctl backlog done <id>`) and recording the per-phase govern checkpoint.

---

## Phase 1: US1 — Fleet reliability foundation (P1)

**Goal**: the shipped fleet completes read-only within budget; codex emits liveness pulses. Closes TASK-288, TASK-145.
**Independent test**: a per-phase barrage on the shipped default config completes read-only within the timeout floor; codex pulses within the tight window.

- [x] T001 [P] [US1] RED test: shipped `templates/audit-barrage-config.yaml` Anthropic lanes carry no `--permission-mode plan`, a non-empty `--disallowedTools` set, raised timeout floor; codex args include `model_reasoning_summary=detailed` — in `tests/audit-barrage/config-default.test.ts` (FR-001/002/003/005)
- [x] T002 [US1] Update `templates/audit-barrage-config.yaml`: remove `--permission-mode plan` from the Anthropic lanes; add the read-only `--disallowedTools` set; raise `timeout_floor_seconds`; add codex `model_reasoning_summary=detailed` + tight liveness window; leave fleet composition (opus+codex+sonnet) unchanged (FR-001/002/003/005)
- [x] T003 [US1] Update the installation `.stack-control/audit-barrage-config.yaml` in lockstep with the template (FR-004)
- [x] T004 [P] [US1] RED test: codex lane emits a liveness pulse within the tight window on a real payload (no false `killed-no-liveness`) — in `tests/audit-barrage/spawn-liveness.test.ts` (FR-003)
- [x] T005 [US1] Wire codex reasoning-summary liveness handling + restore the tight liveness window in `src/scope-discovery/audit-barrage/spawn-cli.ts` (FR-003)
- [x] T006 [US1] Calibrate opus no-grounding; if it cannot meet the timeout envelope, surface a fleet-composition decision to the operator (do NOT drop it unilaterally) — note result in `specs/029-govern-operability/research.md` (Assumptions)
- [x] T007 [US1] Close TASK-288, TASK-145 (`stackctl backlog done`); record the phase-1 govern checkpoint

---

## Phase 2: US2 — Fleet observability: degraded is never convergence (P1)

**Goal**: degraded lanes are surfaced and never counted as quiet. Closes the `audit-barrage-timeout-observability` gap node.
**Independent test**: a forced timed-out lane is reported distinctly and does not increment the quiet streak; a healthy zero-finding run does.

- [x] T008 [P] [US2] RED test: per-lane terminal state (completed / timed-out / killed-no-liveness / killed-external / zero-byte) surfaced distinctly at synthesis + lift — in `tests/audit-barrage/terminal-state.test.ts` (FR-006)
- [x] T009 [US2] Surface per-lane terminal state in `src/scope-discovery/audit-barrage/run-artifacts.ts` (INDEX/synthesis rendering) + name the zero-byte sub-state distinctly in `src/scope-discovery/audit-barrage/types.ts` (`completedNonConvergedAnnotation`) (FR-006)
- [x] T010 [US2] Surface degraded-lane state in `src/subcommands/audit-barrage-lift.ts` fleet filter (distinct from "no findings") + stamp the `Fleet: DEGRADED` section marker in `src/subcommands/audit-barrage-lift-render.ts` (`renderSection`/`renderQuietSection`), incl. the degraded-zero-findings section (FR-006/007)
- [x] T011 [P] [US2] RED test: a run with a degraded lane does NOT increment the dampener quiet streak; a fully-healthy zero-finding run DOES — in `tests/promote-findings/degraded-not-quiet.test.ts` (FR-007/008)
- [x] T012 [US2] Guard the quiet-run count on degraded-fleet in `src/scope-discovery/promote-findings/check-barrage-dampener.ts` (FR-007/008)
- [x] T013 [US2] Close the `audit-barrage-timeout-observability` gap node; record the phase-2 govern checkpoint

---

## Phase 3: US3 — Severity & convergence determinism (P1)

**Goal**: re-rated findings on unchanged code stop defeating the dampener. Closes TASK-146.
**Independent test**: a LOW→HIGH re-rate fixture on unchanged code converges; a new-HIGH fixture blocks.

- [x] T014 [P] [US3] RED test: finding-signature `(normalized-heading, primary-file-path)` equality (reuses cluster-merge normalization) — in `tests/promote-findings/finding-signature.test.ts` (FR-019)
- [x] T015 [US3] Implement the shared finding-signature in `src/scope-discovery/promote-findings/extract-barrage-findings.ts` (single normalizer, no second one) (FR-019)
- [x] T016 [P] [US3] RED test: a re-rated already-seen finding on unchanged code does not reset the quiet streak; a new previously-unseen HIGH does — in `tests/promote-findings/dampener-identity.test.ts` (FR-009/010/011)
- [x] T017 [US3] Key the dampener on finding-identity (count new vs seen) in `src/scope-discovery/promote-findings/check-barrage-dampener.ts`; scope re-rate suppression to the audited code epoch (per-section `Code-sha:` from `tip.sha`, emitted by `src/subcommands/audit-barrage-lift.ts` + `src/subcommands/audit-barrage-lift-render.ts`) so FR-010 "unchanged code" is honored (AUDIT-BARRAGE-codex-01); strip line ranges in `primaryFilePath` (codex-02) (FR-009/010/011/019)
- [x] T018 [US3] Cross-round severity stabilization IS the identity + max-rank mechanism (a literal 2-run-persistence hysteresis would contradict FR-011's reset-on-new-HIGH); implemented in `src/scope-discovery/promote-findings/check-barrage-dampener.ts` (the only surface with cross-run history), not the per-run `cluster-severity.ts`/`adjudicate-findings.ts` (FR-012)
- [x] T019 [US3] Close TASK-146; record the phase-3 govern checkpoint

---

## Phase 4: US4 — Loop hygiene: never lift the done, override is terminal (P1)

**Goal**: the loop stops manufacturing work that defeats its purpose. Closes TASK-149, TASK-317, TASK-318.
**Independent test**: a fixed-in-loop finding yields 0 tasks; `--override` graduates with 0 barrage runs.

- [x] T020 [P] [US4] RED test: lift/slush skip a `fixed-<sha>` finding (in-loop or prior-commit) → 0 tasks — in `tests/promote-findings/never-lift-fixed.test.ts` (FR-013)
- [x] T021 [US4] Skip already-`fixed-<sha>` findings before task creation in `src/subcommands/slush-findings.ts` + `src/subcommands/audit-barrage-lift.ts` (FR-013)
- [x] T022 [US4] Defer MEDIUM-residual migration to the loop terminal in `src/subcommands/slush-findings.ts` (+ `src/govern/convergence-loop.ts` terminal signal) (FR-014)
- [x] T023 [P] [US4] RED test: cross-run signature dedup → ≤1 task per signature across N runs — in `tests/promote-findings/lift-dedup.test.ts` (FR-016)
- [x] T024 [US4] Implement finding-signature dedup across runs in `src/subcommands/audit-barrage-lift.ts` (FR-016)
- [x] T025 [P] [US4] RED test: `backlog done <id>` closes a task; a finding flip to `fixed-<sha>` auto-reconciles its task — in `tests/backlog/done.test.ts` (FR-015)
- [x] T026 [US4] Add the `backlog done`/close verb in `src/backlog/` + auto-reconcile on `fixed-<sha>` (FR-015)
- [x] T027 [P] [US4] RED test: `govern --override "<reason>"` fires 0 barrage runs and records an attributable override graduation — in `tests/govern/override-short-circuit.test.ts` (FR-017/018)
- [x] T028 [US4] Short-circuit the barrage on `--override` (record reason + graduate, NO render/barrage/lift/slush) in `src/subcommands/govern.ts` + `src/govern/convergence-loop.ts` + `src/govern/convergence-types.ts` + `src/govern/override-graduate.ts`; per-phase `--override` writes the phase checkpoint; FR-018 durable attribution = `override`/`overrideReason` persisted in the convergence record (`src/govern/convergence-record.ts` + `src/workflow/workflow-types.ts`) so an override graduation is distinguishable from a real convergence, not just on stderr (FR-017/018)
- [x] T029 [US4] Close TASK-149, TASK-317, TASK-318; record the phase-4 govern checkpoint — phase-4 checkpoint recorded + graduated (dampener engaged on 2 consecutive 0-new-HIGH+ runs, 2026-06-20). Govern surfaced + I fixed a deeper chain of cross-model defects on the override/graduation paths (record-write-FATAL CLI⟺gate alignment, env-var override guard, reconcile-close-all, record-first two-write ordering with accurate per-write messages). 6 MEDIUM/LOW findings lifted to backlog (task-358..363, AUDIT-20260620-122..128) all fixed in-code; pending reconcile to fixed-<sha>.

---

## Phase 5: US5 — Payload-scoping correctness (P2, CRITICAL-PATH)

**Goal**: kill harness-induced false HIGHs. Closes TASK-263, TASK-316.
**Independent test**: a multi-commit phase with a present out-of-window reference raises no false HIGH; a missing impl still raises one.

- [x] T030 [P] [US5] RED test: per-phase payload = union of the phase's changed files across all its commits (diff-base = pre-phase, not HEAD~1) — in `tests/govern/payload-union.test.ts` (FR-020)
- [x] T031 [US5] Resolve diff-base to the pre-phase commit + assemble the union of the phase's changed files in `src/govern/incremental-audit.ts` + `src/subcommands/govern.ts` — the pre-phase-commit anchor is the latest prior phase's recorded `governedSha`, persisted on the checkpoint via `src/govern/checkpoint-state.ts` + `src/govern/phase-checkpoint-status.ts` (FR-020)
- [x] T032 [P] [US5] RED test: a present out-of-window referenced file raises no false "absent/not-imported" HIGH; a genuinely-missing impl still raises a HIGH — in `tests/govern/out-of-window.test.ts` (FR-021/022)
- [x] T033 [US5] Widen the payload to referenced-but-out-of-window deps in `src/govern/payload-implement.ts` AND teach the auditor (audit prompt template) that out-of-window = not-this-phase-scope (FR-021/022)
- [x] T034 [US5] Close TASK-263, TASK-316; record the phase-5 govern checkpoint

---

## Phase 6: US6 — Audit-granularity switch (P2)

**Goal**: either-of graduate gate, default per-phase. Closes TASK-154.
**Independent test**: one feature graduates via per-phase checkpoints, another via a whole-feature record under opt-in; default requires per-phase.

- [x] T035 [P] [US6] RED test: the graduate gate graduates via `all-phase-checkpoints-current` OR whole-feature `record-converged`; default with no opt-in requires per-phase — in `tests/workflow/either-of-gate.test.ts` (FR-023/024)
- [x] T036 [US6] Implement the either-of gate in `src/workflow/gate-eval.ts` + the `graduate-impl` criterion kind in `src/workflow/workflow-types.ts` (+ govern default mode) (FR-023/024)
- [x] T037 [US6] Update `templates/WORKFLOW.md` graduate-gate semantics to the either-of condition (FR-023)
- [x] T038 [US6] Amend the 025 "compose, reject augment" clarify record in `specs/025-unskippable-workflow-protocol/` to document the re-admitted whole-feature path (FR-025)
- [x] T039 [US6] Close TASK-154; record the phase-6 govern checkpoint

---

## Phase 7: US7 — Checkpoint staleness O(n²) fix (P2, CRITICAL-PATH)

**Goal**: hunk-granularity fingerprints keep shared-file features O(n). Closes TASK-289.
**Independent test**: a different-hunk later edit does not stale an earlier checkpoint; a same-region edit does.

- [x] T040 [P] [US7] RED test: a later-phase edit to a DIFFERENT hunk of a shared file does not stale an earlier checkpoint; a SAME-region edit does; total work O(n) — in `tests/govern/hunk-fingerprint.test.ts` (FR-026/027/028)
- [x] T041 [US7] Change `computeScopeFingerprint` to hash the phase's own changed diff hunks (post-image content), not whole-file, in `src/govern/checkpoint-state.ts` (FR-026)
- [x] T042 [US7] Update freshness evaluation in `src/govern/phase-checkpoint-status.ts` for hunk-level staleness (FR-027/028)
- [x] T043 [US7] Close TASK-289; record the phase-7 govern checkpoint

---

## Phase 8: US8 — Process & protocol discipline (P3)

**Goal**: codify the TASK-60 structural drivers. Closes TASK-60.
**Independent test**: the audit/implement skill bodies + barrage prompt templates contain the five drivers; a surface-adding fix triggers the channel-enumeration prompt.

- [ ] T044 [P] [US8] RED test: the audit/implement skill bodies + barrage prompt templates contain channel-enumeration, invariant-first boundary, round-0 self-red-team, fleet-degradation pricing, severity-rubric anchoring — in `tests/skills/process-drivers.test.ts` (presence assertions) (FR-029)
- [ ] T045 [US8] Add the five drivers to the audit/implement skill bodies + barrage prompt templates (FR-029)
- [ ] T046 [US8] Close TASK-60; record the phase-8 govern checkpoint

---

## Phase 9: US9 — 027 residual hygiene (P3)

**Goal**: clear the deferred 027 residuals. Closes TASK-290, 291, 292, 293, 294.
**Independent test**: each residual has a targeted presence/absence check.

- [ ] T047 [P] [US9] RED test: `tests/roadmap/cluster.test.ts` contains no non-null `!` assertions — in `tests/roadmap/cluster-no-nonnull.test.ts` (FR-030)
- [ ] T048 [US9] Replace `!` with the get-or-throw `item()` helper in `tests/roadmap/cluster.test.ts` (TASK-290, FR-030)
- [ ] T049 [US9] Document the `cluster`/`group` verb in the roadmap `SKILL.md` (TASK-291, FR-031)
- [ ] T050 [P] [US9] RED test: uniform empty/stray-comma guard across `--depends-on` / `--into` / `--children` / `--part-of`; dead `--part-of` branch removed — in `tests/roadmap/list-flag-guard.test.ts` (FR-032)
- [ ] T051 [US9] Unify the list-flag guard + remove the dead `--part-of` zero-length branch in `src/subcommands/roadmap.ts` (TASK-292, FR-032)
- [ ] T052 [P] [US9] RED test: decompose `rewriteEdgeLine` does not rewrite a fenced edge example — in `tests/roadmap/rewrite-fence-aware.test.ts` (FR-033)
- [ ] T053 [US9] Make `rewriteEdgeLine` fence-aware in the decompose surface (TASK-293, FR-033)
- [ ] T054 [US9] Update the tooling-feedback guidance to route adopter friction to GitHub issues against `audiocontrol-org/deskwork` (TASK-294/gh-488, FR-034)
- [ ] T055 [US9] Close TASK-290, 291, 292, 293, 294; record the phase-9 govern checkpoint

---

## Phase 10: Polish & feature completion

- [ ] T056 Full vitest suite green; `claude plugin validate plugins/stack-control`; `stackctl check-front-door` exit 0
- [ ] T057 Record quickstart SC-001..SC-009 validation results in `specs/029-govern-operability/quickstart.md`
- [ ] T058 Confirm all 17 backlog tasks (TASK-60/145/146/149/154/263/288/289/290/291/292/293/294/316/317/318) + the two gap nodes are closed (SC-009); advance the roadmap node `multi:feature/govern-operability` toward shipped

---

## Dependencies & ordering

- **Strict phase order US1→US9** (sharpen-the-saw): US1/US2/US3 first make this feature's own per-phase govern reliable/observable/deterministic; US4 builds on US3's finding-signature; US5 + US7 are critical-path (per-phase stays default per US6); US8/US9 last.
- Within a phase: the RED test task precedes its implementation task; `[P]` tasks touch independent files and may run in parallel.
- Shared finding-signature (T015) is a dependency of T017 (dampener identity) and T024 (lift dedup).
- Govern this feature per phase at each phase boundary; commit + push per boundary.

## Parallel opportunities

- Phase 1: T001 ∥ T004 (config test vs spawn-liveness test).
- Phase 4: T020 ∥ T023 ∥ T025 ∥ T027 (independent RED tests).
- Phase 9: T047 ∥ T050 ∥ T052 (independent residual tests).

## Implementation strategy

MVP-by-value = US1+US2+US3+US4 (P1): a reliable, observable, deterministic, hygienic loop — the core operability win and the two operator-named frictions. US5–US9 complete the burndown. Build in listed order; do not skip the RED test.
