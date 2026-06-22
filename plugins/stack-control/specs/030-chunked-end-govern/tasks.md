---
description: "Task list for Chunked whole-feature end-govern"
---

# Tasks: Chunked whole-feature end-govern

**Input**: Design documents from `specs/030-chunked-end-govern/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test-First is NON-NEGOTIABLE (Constitution Principle I). Every FR gets a RED test that is watched to fail for the expected reason BEFORE any implementation task. Clean-break deletions (FR-017..FR-020) get absence/regression tests first.

**Organization**: Tasks are grouped by user story (priority order). Repository root for all paths is `plugins/stack-control/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: Which user story this task belongs to (US1..US8); omitted on Setup / Foundational / Polish
- Every task names an exact file path

## Path Conventions

- Single-project CLI engine: all source under `plugins/stack-control/src/`; tests co-located in `src/**/__tests__/`
- Paths below are relative to the repository root `plugins/stack-control/`

## End-of-task discipline (applies to EVERY implementation task)

- Commit + push at the task boundary, one logical change per commit, no AI attribution (Principle VII).
- No task may leave any touched source file > 500 lines (Principle VI / SC-007). If a change would cross the cap, the decomposition is part of that task, not a follow-up.
- Use `./bin/stackctl` (source engine), never bare `stackctl`, when exercising govern behavior during dev (per `.claude/rules/source-engine-for-stack-control-dev.md`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new module skeleton and confirm the test harness so RED tests can be authored against real (empty) module surfaces.

- [x] T001 Create the `src/govern/cluster-payload/` and `src/govern/fix-fanout/` directories with empty placeholder modules (`coupling-graph.ts`, `clustering.ts`, `envelope-binpack.ts`, `non-audit-trim.ts`, `chunk-id.ts`, `worktree-dispatch.ts`, `merge-serialize.ts`) each exporting a typed stub so imports resolve; co-locate empty `__tests__/` dirs.
- [x] T002 Create empty placeholder modules `src/govern/chunk-manifest.ts`, `src/govern/touched-set.ts`, `src/govern/seam-pass.ts`, `src/govern/end-govern-pipeline.ts`, `src/govern/payload-chunk.ts`, `src/govern/payload-diff-scope.ts`, `src/govern/chunk-artifacts.ts`, each exporting a typed stub.
- [x] T003 [P] Confirm vitest runs the new tests. NOTE: the project's vitest config collects `src/__tests__/**` and `tests/**` only (NOT co-located `src/govern/**/__tests__/`); the project has zero co-located test dirs. Adapted per existing convention — 030 tests live in `src/__tests__/govern/` (alongside `phase-boundary-sizing.test.ts`), already collected; source modules keep the tasks.md paths. Govern suite green (32 files / 190 tests).

**Checkpoint**: Module skeleton resolves; test harness picks up new co-located dirs.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared entity schemas + artifact read/write surface + the deterministic chunk-id primitive that every user story depends on. No story can build its pipeline until these exist.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T004 RED: write `src/govern/__tests__/chunk-artifacts.schema.test.ts` asserting the typed schemas for Chunk, ChunkManifest, SplitClusterMarker, TouchedSet, SeamResult, WholeFeatureConvergenceRecord (per data-model.md) reject missing-required-field and accept a valid fixture; watch it FAIL (schemas absent).
- [x] T005 Implement the entity type definitions + schema validators in `src/govern/chunk-artifacts.ts` (read/write/schema for chunk-set, split-cluster, touched-set, seam, convergence record; installation-anchored under `.stack-control/`, atomic temp+rename matching `convergence-record.ts:35`); make T004 pass.
- [x] T006 RED: write `src/govern/cluster-payload/__tests__/chunk-id.test.ts` asserting chunk id = stable hash of the sorted file-path set and is identical across two runs over the same `governedSha`..HEAD endpoints (FR-004, R3); watch it FAIL.
- [x] T007 Implement `src/govern/cluster-payload/chunk-id.ts` (deterministic stable hash pinned to `governedSha`..HEAD); make T006 pass.
- [x] T008 RED: write `src/govern/cluster-payload/__tests__/envelope-measure.test.ts` asserting the rendered-payload byte-measurement primitive (the envelope currency from `phase-boundary-sizing.ts`) is callable WITHOUT a `phaseId` and returns rendered bytes for a chunk/seam id (research Tension 2 — keep the measurement primitive; rekey off `phaseId`); watch it FAIL.
- [x] T009 Rekey the envelope-measurement primitive in `src/govern/phase-boundary-sizing.ts` so it measures rendered bytes for a chunk/seam id (not a `phaseId`), preserving the measurement while decoupling it from the deleted per-phase concept (research Tension 1 + 2); make T008 pass.

**Checkpoint**: Schemas, deterministic id, and the rekeyed envelope-measurement primitive exist — partitioner + pipeline + gate work can begin.

---

## Phase 3: User Story 1 - Whole-feature audit never FATALs on size (Priority: P1) 🎯 MVP

**Goal**: Partition the whole committed `governedSha`..HEAD diff into envelope-sized coupled chunks, audit them via the CLUSTER→AUDIT→RECONCILE skeleton, sub-split an oversized cluster after a trim pre-pass, and reach a graduation decision with zero `boundary-too-large` FATALs.

**Independent Test**: Run end-govern on a fixture feature whose diff exceeds the smallest negotiated lane envelope. Assert terminal outcome is a graduation decision (not `boundary-too-large`); every governed file appears in exactly one chunk; an oversized cluster produces a recorded `split-cluster` marker.

### Tests for User Story 1 (RED first — watch each FAIL for the stated reason) ⚠️

- [x] T010 [P] [US1] RED: `src/govern/cluster-payload/__tests__/coupling-graph.test.ts` — assert directory-adjacency + diff cross-reference edges are built (universal baseline) and a TS import edge is added when the import graph is present, never required (FR-003, R1); FAIL (no impl).
- [x] T011 [P] [US1] RED: `src/govern/cluster-payload/__tests__/clustering.test.ts` — assert coupled files group into clusters, every changed file in exactly one cluster, clusters disjoint (data-model Cluster validation); FAIL.
- [x] T012 [P] [US1] RED: `src/govern/cluster-payload/__tests__/non-audit-trim.test.ts` — assert the pre-pass drops lockfile/generated/vendored/whitespace/fixture bytes and records each `trimApplied` category+bytes (FR-006, R2); FAIL.
- [x] T013 [P] [US1] RED: `src/govern/cluster-payload/__tests__/envelope-binpack.test.ts` — assert first-fit-decreasing packs clusters into chunks each ≤ envelope, and an oversized single cluster (after trim) sub-splits into ≥2 sub-chunks with a `SplitClusterMarker` (non-empty coverage caveat) and NEVER throws boundary-too-large (FR-002/FR-006, R2); FAIL.
- [x] T014 [P] [US1] RED: `src/govern/cluster-payload/__tests__/determinism.test.ts` — assert running the partitioner twice over identical `base..HEAD` endpoints yields byte-identical chunks/chunkIds/manifests/splitClusterMarkers (FR-004, US1 Scenario 3); FAIL.
- [x] T015 [P] [US1] RED: `src/govern/__tests__/end-govern-pipeline.size.test.ts` — assert end-govern on a fixture diff exceeding the smallest lane envelope reaches a graduation decision (converged/override-eligible), emits ⋃chunks.files == changed-file set, and produces 0 `boundary-too-large` outcomes (SC-001, US1 Scenarios 1-2); FAIL.

### Implementation for User Story 1

- [x] T016 [P] [US1] Implement `src/govern/cluster-payload/coupling-graph.ts` (dir-adjacency + diff cross-ref baseline; capability-gated TS import layer); make T010 pass.
- [x] T017 [P] [US1] Implement `src/govern/cluster-payload/clustering.ts` (group coupled files into disjoint clusters from the coupling graph); make T011 pass.
- [x] T018 [P] [US1] Implement `src/govern/cluster-payload/non-audit-trim.ts` (cheap pre-pass dropping non-audit bytes, recording categories); make T012 pass.
- [x] T019 [US1] Implement `src/govern/cluster-payload/envelope-binpack.ts` (first-fit-decreasing pack ≤ envelope using the rekeyed measurement primitive; oversized-cluster sub-split + `split-cluster` marker; never FATAL) (depends on T009, T016-T018); make T013 pass.
- [x] T020 [US1] Implement the `cluster-payload` aggregate entry (couple→cluster→trim→binpack→manifest, deterministic, per contracts/cluster-payload.md) wiring T016-T019 + chunk-id (T007); make T014 pass.
- [x] T021 [US1] Implement `src/govern/payload-diff-scope.ts` — committed-diff (`base..HEAD`) + untracked-fold scoping, inclusion-based (the FR-023 successor to the exclusion plumbing); RED test `src/govern/__tests__/payload-diff-scope.test.ts` first (assert non-empty `diffScope.files` for a committed-diff fixture; watch FAIL), then implement.
- [x] T022 [US1] Implement `src/govern/payload-chunk.ts` — render ONE chunk's audit payload (diff + plan/spec/contracts + manifest); RED test `src/govern/__tests__/payload-chunk.test.ts` first (assert a chunk payload includes its diff and stays ≤ envelope; watch FAIL), then implement.
- [x] T023 [US1] Implement `src/govern/end-govern-pipeline.ts` CLUSTER→AUDIT→RECONCILE skeleton over committed `governedSha`..HEAD (FR-001; parallel per-chunk barrage fire/render under a fleet-bounded concurrency cap, reusing the existing audit-barrage machinery — FR-008; single reconcile stub) (depends on T020-T022); make T015 pass.

**Checkpoint**: A >envelope fixture feature governs to a decision with zero `boundary-too-large` — MVP partition+audit path works.

---

## Phase 4: User Story 2 - Clean break: per-phase govern is gone, one graduate gate (Priority: P1)

**Goal**: Delete the entire per-phase apparatus (flag, checkpoints, env var, gate arm, doctor rule, compass arms, the boundary-too-large FATAL) and collapse `graduate-impl` to the single converged whole-feature record. Each deletion is asserted absent first.

**Independent Test**: `--phase` / `GOVERN_CHECKPOINT` are clean usage errors (no silent accept); no `phase-checkpoints/*.json` written; the graduate gate passes on the whole-feature record alone; `allPhaseCheckpointsCurrent` and the per-phase doctor rule are absent from the codebase.

### Tests for User Story 2 (absence/regression RED first — watch each FAIL) ⚠️

- [x] T024 [P] [US2] RED: `src/subcommands/__tests__/govern-phase-removed.test.ts` — assert invoking `govern --phase <id>` errors as an unknown flag and setting `GOVERN_CHECKPOINT` is rejected (no legacy accept) (FR-017, US2 Scenario 1); FAIL (arm still present).
- [x] T025 [P] [US2] RED: `src/govern/__tests__/no-phase-checkpoints-written.test.ts` — run end-govern on a fixture and assert no `phase-checkpoints/*.json` exists under the installation anchor afterward (US2 Scenario 3); FAIL.
- [x] T026 [P] [US2] RED: `src/workflow/__tests__/graduate-impl-single-criterion.test.ts` — assert `graduate-impl` PASSES on a converged whole-feature record alone and REFUSES with no converged record and on every `*-surfaced` outcome (FR-018, graduate-gate contract); FAIL (either-of arm present).
- [x] T027 [P] [US2] RED: `src/__tests__/per-phase-surfaces-absent.test.ts` — grep-style assertions that `allPhaseCheckpointsCurrent`, `all-phase-checkpoints-current`, `resolvePhaseCheckpointStatuses`, `assertPriorPhaseCheckpointsCurrent`, `featureCheckpointKey`, `carriedFilesForComposition`, `compositionExcludePaths`, and `BoundaryTooLargeError` yield ZERO source hits (SC-002 = 0 per-phase surfaces); FAIL.
- [x] T028 [P] [US2] RED: `src/govern/__tests__/boundary-too-large-terminal-removed.test.ts` — assert `protocol.ts` exposes no `boundary-too-large` FATAL terminal and the envelope-measurement primitive still measures (research Tension 2 distinction); FAIL.

### Implementation for User Story 2 (each deletion its own task + commit)

- [x] T029 [US2] Delete the `--phase` invocation arm (`govern.ts:810–845`) and `--checkpoint`/`GOVERN_CHECKPOINT` handling (TASK-125) from `src/subcommands/govern.ts`; passing them becomes an unknown-flag/var error; make T024 pass.
- [x] T030 [US2] Delete the exclusion-based whole-feature composition arm (`govern.ts:846–891`) from `src/subcommands/govern.ts`, leaving the single inclusion-based end-govern path; partial toward T025.
- [x] T031 [US2] Delete the per-phase checkpoint writer + `phase-checkpoints/*.json` artifact + its doctor/schema rule (FR-017); make T025 pass. (Completed by T085; verified — T025 green, no `phase-checkpoints/*.json` written.)
- [x] T032 [US2] Collapse `graduate-impl` in `src/workflow/gate-eval.ts` to the single `ctx.implRecordConverged` criterion; delete `allPhaseCheckpointsCurrent` + the `all-phase-checkpoints-current` criterion (`gate-eval.ts:162–199`) + all callers; make T026 pass.
- [x] T033 [US2] Delete the per-phase compass/workflow transition arms (FR-019; TASK-152/155) from the workflow transition modules; partial toward T027. (Completed by T085; verified — `templates/WORKFLOW.md` is the clean govern-at-end model with no per-phase transition arm.)
- [x] T034 [US2] Delete `resolvePhaseCheckpointStatuses`, `assertPriorPhaseCheckpointsCurrent`, `featureCheckpointKey`, `carriedFilesForComposition`, `compositionExcludePaths`, and the `phaseUnit` exclusion plumbing once no caller remains; make T027 pass. (T085 deleted the call sites; this session deleted the orphaned dead modules `incremental-audit.ts` + `phase-enumeration.ts` + `audit-unit-types.ts` and their tests — clean-break-absence.test.ts extended to assert zero non-test source hits.)
- [x] T035 [US2] Delete the `boundary-too-large` FATAL terminal (`protocol.ts:393–404`) and remove `BoundaryTooLargeError` once the bin-packer (its sole would-be consumer) no longer throws it — the bin-packer AVOIDS the condition (research Tension 2); make T028 pass.
- [x] T036 [US2] Wire `src/subcommands/govern.ts` to the single end-govern pipeline path matching the govern-cli contract (kept flags: `--mode implement`, `--diff-base`, `--at`, `--override`); confirm T024-T028 all green. WONTFIX migration/grandfather (FR-020) — no legacy-accept code written.

**Checkpoint**: One govern path, one graduate criterion, zero per-phase surfaces — US1+US2 together are the P1 foundation the P2/P3 stories build on.

---

## Phase 5: User Story 3 - Cross-file correctness preserved across chunk boundaries (Priority: P2)

**Goal**: Each chunk carries a manifest of the OTHER chunks' file lists, and a final interface-level seam pass audits cross-chunk + split-cluster boundaries gated to substantive (cross-boundary) breaks only.

**Independent Test**: Construct a fixture with a contract mismatch spanning two files placed in different chunks; assert the mismatch is surfaced (by a chunk auditor via the manifest or by the seam pass) and a source-compatible signature change raises 0 seam-pass false positives.

### Tests for User Story 3 (RED first) ⚠️

- [x] T037 [P] [US3] RED: `src/govern/__tests__/chunk-manifest.test.ts` — assert each chunk's manifest lists exactly the other chunks' file lists (complete, no self-entry, file-lists-only, no diff bodies) (FR-005, R8, US3 Scenario 2); FAIL.
- [x] T038 [P] [US3] RED: `src/govern/__tests__/seam-pass.substantive.test.ts` — assert the seam pass flags a removed/renamed export, changed arity, or changed required shape CONSUMED across a chunk boundary, and does NOT flag a compatible addition or internal-only change (`consumedAcross=true` on every finding) (FR-014, R7, SC-003, US3 Scenarios 3-4); FAIL.
- [x] T039 [P] [US3] RED: `src/govern/__tests__/seam-payload-envelope.test.ts` — assert the seam payload (signatures + changed-function headers only) is measured ≤ envelope via the rekeyed primitive, keyed on a seam id not a phase id (FR-014, research Tension 1); FAIL.

### Implementation for User Story 3

- [x] T040 [US3] Implement `src/govern/chunk-manifest.ts` (render per-chunk other-chunks file lists; file-lists only) and wire it into `payload-chunk.ts` rendering; make T037 pass.
- [x] T041 [US3] Implement `src/govern/seam-pass.ts` (interface-level cross-chunk + split-cluster boundary audit; substantive-break gate = cross-boundary breakage only; emits `SeamResult` with `suppressedCompatible` count) using the rekeyed envelope measurement; make T038 + T039 pass.
- [x] T042 [US3] Insert the SEAM step into `src/govern/end-govern-pipeline.ts` (after re-audit converges, before reconcile), consulting split-cluster markers to recover cross-sub-chunk coverage (R7).

**Checkpoint**: Cross-chunk contract breaks are caught; compatible changes don't false-positive.

---

## Phase 6: User Story 4 - Bounded convergence: re-audit only what fixes touch (Priority: P2)

**Goal**: Compute the coupling-correct touched set from fix commits, re-audit only those chunks, shrink the set each round, graduate when the dampener clears it, and backstop with a hard round cap that STOPs + surfaces rather than looping.

**Independent Test**: A fix in chunk A touching only A's files re-audits A only (B/C/D carried); the touched set monotonically shrinks; the run reaches a decision in bounded rounds.

### Tests for User Story 4 (RED first) ⚠️

- [x] T043 [P] [US4] RED: `src/govern/__tests__/touched-set.test.ts` — assert touched set = fixed files' own chunks PLUS any chunk a fixed file is coupled into (coupling-correct), a fix-created new file is assigned to a chunk by coupling (FR-007/FR-012, US4 Scenarios 1+3); FAIL.
- [x] T044 [P] [US4] RED: `src/govern/__tests__/touched-set.shrink.test.ts` — assert across rounds the touched set is strictly smaller than the full chunk set whenever ≥1 chunk is untouched, and the loop reaches a graduation decision in bounded rounds (SC-004, US4 Scenario 2); FAIL.
- [x] T045 [P] [US4] RED: `src/govern/__tests__/round-cap-backstop.test.ts` — assert a coupling-cycle fixture that prevents shrink hits the hard round cap and yields outcome `round-cap-surfaced` (STOP, surfaced for override; never loops; never auto-graduates) (FR-013, R5/R6); FAIL.

### Implementation for User Story 4

- [x] T046 [US4] Implement `src/govern/touched-set.ts` (derive touched chunks from fix commits, coupling-correct; assign new files to a chunk by coupling); make T043 pass.
- [x] T047 [US4] Wire the bounded re-audit loop into `src/govern/end-govern-pipeline.ts` (re-audit only the touched set; carry untouched; dampener clears → graduate) using the existing `check-barrage-dampener.ts`; make T044 pass.
- [x] T048 [US4] Implement the hard max-round-cap backstop in `src/govern/end-govern-pipeline.ts` (on cap-hit STOP + emit `round-cap-surfaced` to the operator surface; never auto-graduate); make T045 pass.

**Checkpoint**: Re-audit is bounded and coupling-correct; the loop always terminates.

---

## Phase 7: User Story 5 - Industrialized parallel fix (Priority: P2)

**Goal**: Fix findings grouped by chunk via worktree-isolated fix-subagents in parallel through the capability port; merge back; serialize a conflicting pair; surface unresolvable merges and fix-subagent failures.

**Independent Test**: Findings in N disjoint chunks ⇒ N concurrent fix-subagents in isolated worktrees that merge cleanly; a shared-file pair serializes; an injected fix-subagent failure isolates its chunk, others continue, and the failure surfaces at reconcile.

### Tests for User Story 5 (RED first) ⚠️

- [x] T049 [P] [US5] RED: `src/govern/fix-fanout/__tests__/worktree-dispatch.test.ts` — assert N disjoint-file chunks dispatch N concurrent fix-subagents (capped) in isolated worktrees via the capability port, autonomous apply+commit, with ZERO branches on vendor identity and run-to-completion on a single backend (FR-009, Principle IX, US5 Scenario 1); FAIL.
- [x] T050 [P] [US5] RED: `src/govern/fix-fanout/__tests__/merge-serialize.test.ts` — assert a shared-file pair serializes (not blind-merge), an unresolvable merge is surfaced (no fabricated resolution → `unresolvable-merge-surfaced`), worktree exhaustion queues excess (FR-010, US5 Scenarios 2-3); FAIL.
- [x] T051 [P] [US5] RED: `src/govern/fix-fanout/__tests__/fix-failure-isolation.test.ts` — assert a fix-subagent failure isolates its chunk, others continue, and the failure surfaces at reconcile as `fix-failure-surfaced` (FR-011, US5 Scenario 4); FAIL.

### Implementation for User Story 5

- [x] T052 [US5] Implement `src/govern/fix-fanout/worktree-dispatch.ts` (per-chunk fix-subagent dispatch via the capability port; concurrency cap with queueing; autonomous apply+commit; capability-not-vendor selection; fail-loud when no backend declares the capability); make T049 pass.
- [x] T053 [US5] Implement `src/govern/fix-fanout/merge-serialize.ts` (merge fix worktrees back; serialize a conflicting pair; surface unresolvable merge; lane-outage degrades per existing fleet behavior); make T050 pass.
- [x] T054 [US5] Wire the FIX step into `src/govern/end-govern-pipeline.ts` (group findings by chunk → fix-fanout → collect `fixCommits`/`failedChunks`/`unresolvableMerges`; failures + unresolvable merges flow to reconcile surface); make T051 pass.

**Checkpoint**: Parallel worktree fix runs unattended; conflicts and failures surface rather than fabricate.

---

## Phase 8: User Story 6 - Reconcile once; in-loop-fixed findings don't balloon the backlog (Priority: P2)

**Goal**: Reconcile exactly once into a single whole-feature convergence record; close findings fixed within the loop BEFORE the lift step so they are not lifted; lift findings still open at graduation.

**Independent Test**: A finding F raised round 1 and fixed round 2 (absent from the clean final round) is NOT an open backlog task at graduation; a finding still open at graduation IS lifted.

### Tests for User Story 6 (RED first) ⚠️

- [x] T055 [P] [US6] RED: `src/govern/__tests__/reconcile-once.test.ts` — assert exactly ONE `WholeFeatureConvergenceRecord` per feature is written at reconcile, with `closedInLoopFindings` and `liftedFindings` disjoint (FR-015, US6 Scenario 3, data-model validation); FAIL.
- [x] T056 [P] [US6] RED: `src/govern/__tests__/close-in-loop-before-lift.test.ts` — assert a finding fixed within the re-audit loop is closed BEFORE lift and NOT lifted as open, while a still-open finding IS lifted (FR-016, SC-005, US6 Scenarios 1-2); FAIL.

### Implementation for User Story 6

- [x] T057 [US6] Change `src/govern/audit-barrage-lift.ts` / `src/govern/loop-hygiene.ts` so in-loop-fixed findings (absent from the clean/dampened final round) are closed before `partitionLiftableFindings` runs — absorbs `govern-lift-auto-close-in-loop-fixes` (R9); make T056 pass.
- [x] T058 [US6] Change `src/govern/convergence-record.ts` to write the single whole-feature record (fields per data-model: `governedShaBase`, `headSha`, `chunkIds`, `rounds`, `liftedFindings`, `closedInLoopFindings`, `seamResultRef`, `splitClusterRefs`, `outcome`); wire the single RECONCILE call in `end-govern-pipeline.ts`; make T055 pass.

**Checkpoint**: Single record per feature; the in-loop lift balloon is eliminated for end-govern.

---

## Phase 9: User Story 7 - New artifacts have a doctor/schema surface (Priority: P3)

**Goal**: Every new on-disk artifact is schema-validated and covered by a doctor rule that flags malformed/stale/dangling artifacts with an actionable message.

**Independent Test**: Corrupt each new artifact in a fixture (malformed JSON, missing field, dangling split-cluster ref, stale fingerprint) and assert `doctor` flags it actionably.

### Tests for User Story 7 (RED first) ⚠️

- [x] T059 [P] [US7] RED: `src/doctor/__tests__/chunked-govern-artifacts.test.ts` — assert the doctor rule flags a malformed whole-feature convergence record, a missing required field on each new artifact, and a `split-cluster` marker referencing a non-existent chunk (dangling ref) with actionable messages (FR-021, SC-006, US7 Scenarios 1-2); FAIL.

### Implementation for User Story 7

- [x] T060 [US7] Implement the doctor rule `src/doctor/chunked-govern-artifacts.ts` validating chunk-set, split-cluster markers, touched-set rounds, seam result, and whole-feature convergence record against the schemas in `chunk-artifacts.ts`; make T059 pass.

**Checkpoint**: Malformed new artifacts are caught, not silently trusted.

---

## Phase 10: User Story 8 - Targeted refactor: decompose the payload module, replace the broken composition path (Priority: P3)

**Goal**: Confirm `payload-implement.ts` is fully superseded by `payload-chunk.ts` + `payload-diff-scope.ts` (each ≤500 lines), the inclusion-based path replaces the exclusion-based composition path, and the prior composition bugs no longer reproduce.

**Independent Test**: No touched source file exceeds 500 lines; the prior composition-bug repros (empty `diffScope.files`, unscoped commit subjects, ignored checkpoint env, dead re-audit branch) no longer reproduce.

### Tests for User Story 8 (RED first) ⚠️

- [x] T061 [P] [US8] RED: `src/govern/__tests__/composition-bugs-gone.test.ts` — assert the four prior repros are gone: non-empty `diffScope.files` for a committed-diff fixture, commit subjects scoped to the chunk, no checkpoint-env code path, no dead re-audit branch (FR-023, US8 Scenario 2); FAIL until the old arm is fully removed/superseded.
- [x] T062 [P] [US8] RED: `src/govern/__tests__/file-line-cap.test.ts` — assert every source file touched by this feature is ≤500 lines, including the `payload-implement.ts` successors and every new chunking module (SC-007, FR-022, Principle VI); FAIL if any over-cap.

### Implementation for User Story 8

- [x] T063 [US8] Remove `src/govern/payload-implement.ts` (now fully superseded by `payload-diff-scope.ts` + `payload-chunk.ts` + `cluster-payload/`); repoint any remaining importers to the successors; make T061 pass. (Completed by T085; verified — `payload-implement.ts` absent, T061 green.)
- [x] T064 [US8] Audit + split any feature-touched file still >500 lines into focused successors with one-line responsibilities; make T062 pass. (Verified — T062/file-line-cap green; T086 closed the last over-cap file, `govern.ts`.)

**Checkpoint**: No over-cap file; the broken exclusion-based composition path is gone.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Settle the carried open questions, run the quickstart validation, and final cross-story hygiene.

- [x] T065 [P] Settle **OQ-1 (non-TS coupling precision)** — decide ship-now vs follow-on for the per-adopter coupling-resolver seam; record the decision in `src/govern/cluster-payload/coupling-graph.ts` doc-comment + the spec Open Questions, or carry it forward as an explicitly-marked open item (capture-over-cut). Do NOT silently drop.
- [x] T066 [P] Settle **OQ-2 (concurrency-cap default)** — fix the default worktree-fix concurrency cap (recommendation ≈4) and whether it is adopter-configurable; record in `src/govern/fix-fanout/worktree-dispatch.ts` config + the spec Open Questions. Do NOT silently drop.
- [x] T067 Run the `specs/030-chunked-end-govern/quickstart.md` validation scenarios end-to-end against the fixture features (map SC-001..SC-007); record evidence.
- [x] T068 [P] Final per-file line-count + per-phase-surface-count sweep (re-run T027 + T062 assertions) confirming SC-002 (0 per-phase surfaces) and SC-007 (no >500-line file) across the whole feature diff.

---

## Phase 12: User Story 9 - Wire the end-govern pipeline as the CLI's single path (Priority: P1)

**Goal**: Make the authored-but-unwired `end-govern-pipeline` the implement-mode CLI's actual execution path, delivering FR-008/009/012/015/016 at the CLI, and fix the dogfood-surfaced defects at their root (one record, one lift, rendered-byte sizing, full coverage, scoped checkpoint, standard untracked diff, seam arity). Discovered by dogfooding the 245-file feature diff on this branch (Clarifications § Session 2026-06-21 dogfood).

**Independent Test**: Drive implement-mode govern over a >envelope multi-chunk fixture; assert one `WholeFeatureConvergenceRecord` + one lift section, the gate reads that record, no chunk renders over-envelope, union(chunk files)==changed set, and the per-chunk `runProtocol` loop is gone from `govern.ts`.

> Note: this phase SUPERSEDES the still-open per-phase deletions (T031/T033/T034) and the decomposition tasks (T062/T063/T064) — they are completed AS PART of T085/T086 below (one clean break, not a separate pass). T062's RED test was marked done but never written; T077 writes it.

### Tests for User Story 9 (RED first — watch each FAIL for the stated reason) ⚠️

- [X] T069 [P] [US9] RED: `src/__tests__/govern/cli-drives-pipeline.test.ts` — a >envelope multi-chunk implement-mode CLI run writes exactly ONE `WholeFeatureConvergenceRecord` and ONE audit-log lift section (not one-per-chunk), and `govern.ts` source contains no per-chunk `runProtocol` invocation loop (FR-024/026, SC-008); FAIL while the CLI loops `runProtocol`.
- [X] T070 [P] [US9] RED: `src/__tests__/workflow/gate-reads-pipeline-record.test.ts` — after a converged pipeline run, `isModeConverged`/`implRecordConverged` reads the pipeline's `WholeFeatureConvergenceRecord`; the divergent implement-mode `GovernConvergenceRecord` read path is absent (FR-025, SC-008); FAIL while the gate reads the old record.
- [X] T071 [P] [US9] RED: `src/govern/cluster-payload/__tests__/rendered-byte-sizing.test.ts` — a chunk whose RAW diff ≤ envelope but whose RENDERED payload (preamble+trailer+framing+folded deps) > envelope is split so no chunk renders over-envelope (FR-027, SC-009); FAIL while sizing measures raw bytes.
- [X] T072 [P] [US9] RED: `src/govern/cluster-payload/__tests__/coverage-through-trim.test.ts` — union(chunk files)==changed set including non-audit-trimmed files; an all-non-audit oversized cluster yields no dangling `SplitClusterMarker` (subChunkIds ≥ 2 or none) (FR-028, SC-010); FAIL while trim drops files / emits empty markers.
- [X] T073 [P] [US9] RED: `src/govern/__tests__/fix-newfile-reaudit.test.ts` — a fix that creates a NEW file assigns it to a chunk for re-audit through the wired pipeline, never dropped (FR-007); FAIL until wired.
- [X] T074 [P] [US9] RED: `src/__tests__/govern/checkpoint-mode-scope.test.ts` — `GOVERN_CHECKPOINT`/`--checkpoint` is REJECTED in implement mode and ACCEPTED in spec mode (FR-029); FAIL while rejection fires for all modes.
- [X] T075 [P] [US9] RED: extend `payload-diff-scope.test.ts` — the untracked-fold renders a `git diff --no-index` standard diff, not a synthetic `+`-line format (FR-030); FAIL while it synthesizes `+`-lines.
- [X] T076 [P] [US9] RED: `src/govern/__tests__/seam-arity.test.ts` — the seam-pass signature comparison counts arity correctly for a function-typed parameter (its inner parens do not terminate the scan) (FR-031); FAIL while the regex stops at the first `)`.
- [X] T077 [P] [US9] RED: `src/govern/__tests__/file-line-cap.test.ts` — the MISSING T062 test: assert every feature-touched source file (incl. `govern.ts` + the `payload-implement.ts` successors) is ≤500 lines (SC-007, FR-022); FAIL while `govern.ts` (985) / `payload-implement.ts` (801) are over-cap.

### Implementation for User Story 9

- [X] T078 [US9] Render-aware sizing: measure rendered payload bytes (preamble+trailer+per-file framing+FR-021 folded deps) in the partition/bin-pack envelope check; make T071 pass. (FR-027)
- [X] T079 [US9] Coverage-preserving trim: a trimmed file stays covered in exactly one chunk (bytes excluded from measure/render, file retained); eliminate the empty/dangling `SplitClusterMarker`; the render honors the same trim; make T072 pass. (FR-028)
- [X] T080 [US9] Untracked-fold renders `git diff --no-index` (matching the render arm), not synthetic `+`-lines; make T075 pass. (FR-030)
- [X] T081 [US9] Seam-pass arity: skip balanced inner parens (function-typed params) when scanning a signature; make T076 pass. (FR-031)
- [X] T082 [US9] Scope `GOVERN_CHECKPOINT`/`--checkpoint` rejection to implement mode only (spec mode keeps its label); make T074 pass. (FR-029)
- [X] T083 [US9] Unify the convergence record: the pipeline's `WholeFeatureConvergenceRecord` IS what the gate reads; delete the implement-mode `GovernConvergenceRecord` read path; make T070 pass. (FR-025)
- [X] T084 [US9] WIRE the CLI: replace the per-chunk `runProtocol` loop in `govern.ts` with a single `runEndGovern` drive — `auditOne` → the barrage fire/render, `runFix` → fix-fanout, `canMerge` → merge-serialize — reconcile-once → ONE lift; make T069/T073 pass. (FR-024/026, FR-007)
- [X] T085 [US9] Clean break: delete the per-phase modules + the reused per-chunk path — `compose-convergence`, `phase-checkpoint-status`, `checkpoint-state` per-phase arms, the per-phase compass/workflow transitions, `resolvePhaseCheckpointStatuses`/`assertPriorPhaseCheckpointsCurrent`/`featureCheckpointKey`/`carriedFilesForComposition`/`compositionExcludePaths`, and `payload-implement.ts` once superseded; repoint importers; completes T031/T033/T034 + T063; keep the absence tests (T027/T061) green. (FR-017/019/023)
  - DONE: deleted `compose-convergence.ts`, `phase-checkpoint-status.ts`, `checkpoint-state.ts`, `hunk-fingerprint.ts` (dead per-phase freshness), `payload-implement.ts`. Survivors relocated: `computeScopeFingerprint`→`scope-fingerprint.ts`, audit lens/framing→`audit-constants.ts`, commit-subjects→`implementCommitSubjects` in `payload-diff-scope.ts`. Rewired importers: `execute-check` (deleted per-phase cadence), `capability-reconcile` (→`isImplFeatureConverged`), `redesign`/`workflow` (no per-phase staling), `govern.ts` (drops the dead per-chunk path + assembler). ~15 test files migrated/deleted. T027/T061 green. (Also completes T030.)
- [X] T086 [US9] Decompose `govern.ts` and the `payload-implement.ts` successors under the 500-line cap (completes T064); make T077 pass. (FR-022, SC-007)
  - DONE (protocol.ts): moved `GovernTerminalKind`/`GovernProtocolError`/`BarrageVars` into `govern/govern-protocol-types.ts` (re-exported from protocol.ts); 555 → 498 ≤ cap.
  - DONE (govern.ts): `subcommands/govern.ts` 1038 → 333. Extracted the CLI helpers + BarrageVars builders (`parseFlags`/`pick`/`resolveBarrageBin`/`tail`/`resolveAuditLogExcerpt`/`resolveSpecPath`/`formatScopeExclusionSummary`/`buildImplementVars`/`buildSpecVars`/`resolveGovernExcludePaths`/`resolveGovernFeatureRoot`/`preflightNegotiatedFleet`/`resolveCeiling`/`PLUGIN_ROOT`/`USAGE`/`GovernFlags`) into `govern/govern-vars.ts` (363); split `runGovern`'s three arms — the override short-circuit (`maybeOverrideGraduate`), the implement-arm end-govern drive (`runImplementArm`), the spec-arm convergence loop (`runSpecArm`) + `emitTerminalOutcome` + the `GovernRunContext` shared-locals object — into `govern/govern-arms.ts` (474). `runGovern` keeps the preamble + feature-slug resolution + context assembly + dispatch + try/catch. Repointed 3 tests (`govern-audit-lens`, `govern-audit-log-excerpt`, `payload-exclusion`) to `govern-vars.js`, and the 2 source-introspection tests (`cli-drives-pipeline`, `composition-bugs-gone`) to read the combined command surface (govern.ts + govern-arms.ts). Pure file-size refactor, no behavior change — full suite green (2466), T077 green, all three files ≤ cap.

**Checkpoint**: the CLI drives the pipeline; one record / one lift / one dampener run; rendered-byte chunking; full coverage with no dangling markers; clean break complete; no over-cap file. US9 retires the unwired-core gap.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all user stories (schemas, chunk-id, rekeyed envelope-measurement primitive).
- **US1 (Phase 3) + US2 (Phase 4)**: both P1 — together they are the foundation the rest build on. US1 builds the partition+audit path; US2 makes it the single path and deletes per-phase. US2's deletions assume US1's inclusion-based pipeline exists (T036 wires to it; T035 depends on the bin-packer from T019 so `BoundaryTooLargeError` has no thrower).
- **US3 (Phase 5)**: depends on US1 (chunks + manifest + pipeline) — adds seam pass + manifest rendering.
- **US4 (Phase 6)**: depends on US1 (chunks + pipeline) — adds bounded re-audit.
- **US5 (Phase 7)**: depends on US4 (touched-set drives re-audit of fix commits) — adds parallel fix.
- **US6 (Phase 8)**: depends on US4 + US5 (loop + fix commits) — single reconcile + close-before-lift.
- **US7 (Phase 9)**: depends on Foundational schemas + all artifacts existing (US1-US6) — doctor surface.
- **US8 (Phase 10)**: depends on US1 (successors exist) + US2 (old arm removed) — final decomposition confirmation.
- **Polish (Phase 11)**: depends on all desired stories.

### Story completion order

P1 foundation: **US1 → US2** (interleavable; US2 deletions land as US1 surfaces stabilize). Then P2: **US3, US4** (parallel after US1), **US5** (after US4), **US6** (after US4+US5). Then P3: **US7, US8**.

### Within each story

- RED tests written and watched to FAIL before implementation (Principle I, NON-NEGOTIABLE).
- Pure functions (coupling-graph, clustering, binpack, chunk-id, touched-set, seam detector) before the pipeline that composes them.
- Pipeline step wiring after the step's module exists.

---

## Parallel Opportunities

- **Setup**: T003 is [P].
- **Foundational**: T004/T006/T008 (RED tests, different files) are authorable in parallel; their impls T005/T007/T009 are sequential per dependency.
- **US1 tests**: T010-T015 all [P] (different test files).
- **US1 impls**: T016-T018 [P] (independent pure modules); T019/T020 serialize on them.
- **US2 absence tests**: T024-T028 all [P]; the deletion impls T029-T035 mostly touch different files (govern.ts arms serialize within that file).
- **US3/US4/US5/US6/US7/US8 tests**: each story's RED tests are [P] within the story.
- **Cross-story**: once US1 lands, US3 and US4 can proceed in parallel by different implementers.
- **Polish**: T065/T066/T068 are [P].

### Parallel example (US1 tests)

```bash
Task: "RED coupling-graph.test.ts"        # T010
Task: "RED clustering.test.ts"            # T011
Task: "RED non-audit-trim.test.ts"        # T012
Task: "RED envelope-binpack.test.ts"      # T013
Task: "RED determinism.test.ts"           # T014
Task: "RED end-govern-pipeline.size.test.ts"  # T015
```

---

## Implementation Strategy

### MVP First (US1 + US2 — the P1 foundation)

1. Phase 1 Setup → Phase 2 Foundational (CRITICAL — blocks all stories).
2. Phase 3 US1 — a >envelope fixture governs to a decision with zero `boundary-too-large`.
3. Phase 4 US2 — collapse to the single govern path + single graduate gate; delete per-phase.
4. **STOP and VALIDATE**: end-govern is the only path, never FATALs on size, graduates on the whole-feature record alone.

### Incremental Delivery (P2 then P3)

1. US3 cross-file correctness (manifest + seam) → test independently.
2. US4 bounded re-audit → test independently.
3. US5 parallel fix → test independently.
4. US6 reconcile-once + close-before-lift → test independently.
5. US7 doctor/schema surface → test independently.
6. US8 decomposition confirmation → test independently.
7. Polish: settle OQ-1/OQ-2, run quickstart, final sweep.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- [Story] label maps each task to its user story for traceability; Setup/Foundational/Polish carry no story label.
- Verify every RED test FAILS for the stated reason before implementing.
- Commit + push at each task boundary (Principle VII); one logical change per commit; no AI attribution.
- No task leaves a touched file >500 lines (Principle VI / SC-007).
- Open questions OQ-1 and OQ-2 are SETTLED or CARRIED in Polish (T065/T066), never silently dropped.
