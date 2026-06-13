# Tasks: Anchor Unification

**Input**: Design documents from `specs/016-anchor-unification/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution Principle I (Test-First, NON-NEGOTIABLE): every fix lands RED-first; each defect's reproduction comes from its captured audit finding / backlog item.

**Organization**: Grouped by user story (US1–US6 from spec.md). Backlog provenance: TASK-56 (seed), TASK-22/40/49/50/51/52/53/55 — each implementation task names the item it burns down.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single project; all paths relative to `plugins/stack-control/`.

---

## Phase 1: Setup

No project-initialization work — existing plugin, existing test harness. (Inventory verified in plan.md § Current-state map.)

- [ ] T001 Baseline: run `npx vitest run src/__tests__/installation-isolation-probe.test.ts src/__tests__/installation-isolation-cwd.test.ts` and record green baseline; confirm `src/subcommands/govern.ts` (629) and `src/govern/payload-implement.ts` (620) line counts as the over-cap starting points

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared anchor seam every story consumes (research R1/R2/R8; contracts/anchor-resolution.md, contracts/resolver-error-wording.md; FR-001, FR-009, FR-013).

**⚠️ CRITICAL**: All six stories thread through this seam — complete before story work.

- [ ] T002 RED: unit tests for `resolveAnchor` in `src/__tests__/anchor.test.ts` — fixture trees covering: 1 marker → resolved domain (cwd-walkup + at-flag sources); 0 markers → error `code: 'not-found'`; ≥2 nested markers → error `code: 'overlap'` carrying ALL roots; `--at` precedence over cwd; nonexistent `--at` dir → usage-shaped error; malformed config.yaml → parse error (NOT not-found); whole-walk scan past the first marker
- [ ] T003 RED (same file): unit tests for `classifyResolverError` — not-found → frozen `FATAL — `+`stackctl setup` class; overlap → roots-naming message WITHOUT the class; malformed/other → verbatim pass-through WITHOUT the class
- [ ] T004 GREEN: implement `src/config/anchor.ts` — `resolveAnchor({ at?, startDir? })` (whole-walk marker scan per data-model § Anchor; wraps `resolveInstallation` config loading) + `classifyResolverError(err)`; export types per data-model (Anchor, ResolverErrorClass)
- [ ] T005 Extend `src/config/installation.ts` walk-up to support the whole-walk scan (collect all markers, not first-hit) consumed by T004 — preserve the existing `resolveInstallation` single-result API and its `not-found` error shape for current callers

**Checkpoint**: anchor seam green; stories can proceed (US1–US5 in parallel groups; US6 any time).

---

## Phase 3: User Story 1 — One govern run, one anchor (Priority: P1) 🎯 MVP

**Goal**: Every govern sub-step (feature root, run-dir, audit-log, store exclusion, slush) derives from the run's single anchor; inert exclusion impossible; divergence loud. Burns down TASK-56 (gh-460) + TASK-40 (AUDIT-20260611-13). Research R7.

**Independent Test**: quickstart V1; suite `govern-payload-self-reference.test.ts` exercising the real seam against an in-repo committed store.

### Tests (RED first)

- [ ] T006 [P] [US1] RED: extend `src/__tests__/govern-payload-self-reference.test.ts` — in-repo committed-store seam test: fixture repo whose domain carries a committed `backlog/tasks/` store, NO `STACKCTL_BACKLOG_DIR`, run `runGovern → resolveGovernExcludePaths → assembler` and assert zero store paths in the payload (FR-003; preconditions per CHK028: env var unset, store inside payload frame)
- [ ] T007 [P] [US1] RED (same file): cross-anchor case — cwd inside a DIFFERENT domain than the govern `--at` target; assert exclusion derives from the target domain's store, not the cwd's (the AUDIT-20260611-13 reproduction)
- [ ] T008 [P] [US1] RED: govern sub-step divergence in `src/__tests__/govern-anchor-unification.test.ts` — fixture where the slush/backlog sub-step cannot operate against the run's anchor; assert govern exits non-zero with a message naming the diverging sub-step (FR-002; retires the non-fatal exit-1 skip), and assert the no-domain case refuses with the not-found class before any sub-step runs

### Implementation

- [ ] T009 [US1] Thread the run's resolved anchor (already `installation.root` in `src/subcommands/govern.ts`) into `resolveGovernExcludePaths` — delete the `backlogRoot()`/`process.cwd()` resolution inside it; accept the anchor as a parameter (closes TASK-40's wrong-store channel)
- [ ] T010 [US1] Same anchor into the slush step in `src/subcommands/govern.ts`; replace the non-fatal exit-1 skip with the loud divergence FATAL per contracts/resolver-error-wording.md (closes TASK-56's lost slush lane)
- [ ] T011 [US1] `src/govern/payload-implement.ts`: make a resolved-but-out-of-frame exclusion an ERROR instead of inert filtering (FR-003); when `STACKCTL_BACKLOG_DIR` is active, exclude BOTH the override store and the anchor's committed store path (research R7); report the env pierce on stderr
- [ ] T012 [US1] Verify T006–T008 green; run the full isolation suites; commit + push

**Checkpoint**: US1 delivers the MVP — the governance hook works anchored, with the self-reference channel closed.

---

## Phase 4: User Story 2 — Each domain owns its configuration completely (Priority: P2)

**Goal**: Config = domain override → plugin default, source reported; setup seeds an owned copy; malformed config loud. Burns down TASK-55 (gh-461) under the isolation decree. Research R4.

**Independent Test**: quickstart V2.

### Tests (RED first)

- [ ] T013 [P] [US2] RED: extend `src/__tests__/scope-discovery/audit-barrage/config-loader-v2.test.ts` — config file placed in the domain's PARENT directory (and at a simulated git toplevel) is never read (two-level resolution only); malformed domain override → loud parse failure, NOT fall-through to plugin default; resolved source (`domain-override` | `plugin-default`) surfaced in the loader's result
- [ ] T014 [P] [US2] RED: extend `src/__tests__/setup.test.ts` (or create) — `stackctl setup --apply` seeds `.stack-control/audit-barrage-config.yaml` as a verbatim copy of `templates/audit-barrage-config.yaml` lane content with a provenance header (template source + date + tune-here invitation, per FR-004/CHK024); idempotent re-run does not clobber an edited copy

### Implementation

- [ ] T015 [US2] `src/scope-discovery/audit-barrage/config-loader.ts`: return + report the resolved source; ensure malformed override is a loud error (no default fall-through); confirm no path outside the domain is consulted (assert in code, not just tests)
- [ ] T016 [US2] `src/subcommands/setup.ts`: add the barrage-config seeding step (managed-file list grows by one); refuse-on-overlap precondition comes from US6's shared primitive — wire the call here when T024 lands
- [ ] T017 [US2] Surface the config source line in govern/barrage run output (`config: domain-override (<path>)` form per contracts/resolver-error-wording.md § Reporting duties); verify T013/T014 green; commit + push

**Checkpoint**: US1+US2 independently green.

---

## Phase 5: User Story 3 — Backlog verbs complete the anchor contract (Priority: P2)

**Goal**: `--at` on the backlog dispatcher (all verbs); import-slush audit-log via the anchor; promote advisory re-based. Burns down TASK-51, TASK-53, TASK-22. Research R5/R6; contracts/cli-at-flag.md.

**Independent Test**: quickstart V4 (three-way cwd-invariance matrix, SC-004 normalization: ids + timestamps only).

### Tests (RED first)

- [ ] T018 [P] [US3] RED: in `src/__tests__/installation-isolation-cwd.test.ts` — DELETE the "backlog has no --at by contract" carve-out (line ~131); add backlog rows (capture, import-github, import-slush, promote, list) to the three-variant matrix (domain root / subdir / `--at` from outside) asserting normalized byte-equivalence of placement + advisory output
- [ ] T019 [P] [US3] RED: import-slush from a domain subdirectory finds the feature audit log (TASK-53 reproduction) in `src/__tests__/backlog-import-slush.test.ts` (extend existing import-slush coverage)
- [ ] T020 [P] [US3] RED: promote pending-create advisory from a domain subdirectory emits NO false "does not yet exist" for a target existing at the domain root (TASK-22 reproduction) in `src/__tests__/backlog-promote.test.ts` (extend)

### Implementation

- [ ] T021 [US3] `src/subcommands/backlog.ts`: parse `--at` at the dispatcher; resolve the anchor ONCE via `resolveAnchor`; thread `domainRoot` into `backlogRoot()`/`resolveInstallationBacklog()` and into import-slush's `resolveFeatureRoot` (replacing `process.cwd()`); nonexistent `--at` dir → usage refusal (FR-006)
- [ ] T022 [US3] `src/backlog/root.ts`: accept the explicit start dir from the dispatcher; keep `STACKCTL_BACKLOG_DIR` precedence + report it when it changes the outcome
- [ ] T023 [US3] `src/backlog/promote.ts` (~131–134): join advisory target paths against the anchor's `domainRoot` (FR-007); verify T018–T020 green; commit + push

**Checkpoint**: SC-004 holds across the full matrix.

---

## Phase 6: User Story 6 — Harness self-safety (Priority: P3, pulled forward as test-infra)

**Goal**: Fixtures verify no real domain encloses them; overlap primitive shared with setup refusal. Burns down TASK-49 (AUDIT-20260612-02). Research R9. (Ordered before US4/US5 because their new fixtures inherit the guard.)

### Tests (RED first)

- [ ] T024 [P] [US6] RED: in `src/__tests__/_isolation-harness.test.ts` (new) — simulate a marker above the fixture root (injection seam on the harness, e.g. an overridable walk-stop or a probe hook); assert `makeMarkerlessFixture`/`makeNestedFixture` REFUSE with the explanatory message BEFORE any verb runs, and assert zero writes outside the fixture tree (write-snapshot)

### Implementation

- [ ] T025 [US6] `src/__tests__/_isolation-harness.ts`: initialization guard — assert the walk-up from the fixture parent (OS tmpdir) resolves no domain, fail loud with explanation otherwise (FR-010); reuse the T004 whole-walk primitive
- [ ] T026 [US6] `src/subcommands/setup.ts`: creation-side no-overlap refusal (any marker at or above target → usage-level refusal naming the existing root, zero writes; FR-013 / SC-009) + RED test in `src/__tests__/setup.test.ts` first; verify; commit + push

**Checkpoint**: every fixture-based suite is now self-guarding.

---

## Phase 7: User Story 4 — Spec-pointer resolution, domain-internal (Priority: P3)

**Goal**: Marker resolution consults only domain context; full-path anchoring; existence validation; toplevel layer retired. Burns down TASK-50 (AUDIT-20260612-03). Research R3.

**Independent Test**: quickstart V5.

### Tests (RED first)

- [ ] T027 [P] [US4] RED: `src/__tests__/resolve-spec-path.test.ts` (new) — domain context file selects the domain's spec; stale copy at a simulated toplevel NEVER read (TASK-50's bad case); installation-prefixed pointer (`plugins/<x>/specs/<feat>/plan.md`) anchors to the full path (no mid-string truncation); non-existing candidate → loud failure naming marker text + domain base (no constructed-path ENOENT); missing domain context file → loud failure, no upward fallback; multi-match / mid-segment `specs/` lines anchor correctly

### Implementation

- [ ] T028 [US4] Extract spec-pointer resolution from `src/subcommands/govern.ts` (~193–233) into `src/govern/resolve-spec-path.ts`: domain-internal base only (DELETE the git-toplevel second base + `deriveDistinctGitToplevel` consultation), full-path-anchored match, existence-validated accept (FR-008)
- [ ] T029 [US4] Re-wire `src/subcommands/govern.ts` to the new module; verify govern.ts net line-count decrease (over-cap relief, Principle VI); verify T027 green; commit + push

**Checkpoint**: V5 passes on transitional-layout fixtures.

---

## Phase 8: User Story 5 — One wording-class rule (Priority: P3)

**Goal**: All resolver-consuming verbs render not-found (and only not-found) in the frozen class via the shared helper. Burns down TASK-52 (AUDIT-20260612-05). Research R8.

**Independent Test**: quickstart V6.

### Tests (RED first)

- [ ] T030 [P] [US5] RED: `src/__tests__/resolver-wording-uniformity.test.ts` (new) — drive ALL resolver-consuming verbs (backlog, install-scope-discovery, scope-widen, scope-inventory, slush-findings, audit-barrage, audit-barrage-lift) under (a) no enclosing domain → every stderr carries the identical `FATAL — `+setup class; (b) corrupt domain config.yaml → every stderr carries the verbatim parse error WITHOUT the class (SC-005: 100%/0%); enumerate the verb set from the dispatcher inventory so a new verb fails the count (CHK020)

### Implementation

- [ ] T031 [P] [US5] Swap `classifyResolverError` into the six unconditional sites: `src/scope-discovery/scope-widen.ts` (~281), `src/scope-discovery/scope-inventory.ts` (~312), `src/subcommands/slush-findings.ts` (~135), `src/subcommands/audit-barrage.ts` (~365), `src/subcommands/audit-barrage-lift.ts` (~403), plus confirm the two gated sites (`src/subcommands/backlog.ts` ~301–305, `src/scope-discovery/install-scope-discovery.ts` ~221–228) consume the same helper with unchanged output
- [ ] T032 [US5] Verify T030 green; net line-count delta ≤ 0 on the four already-over-cap files touched; commit + push

**Checkpoint**: SC-005 measurable and green.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T033 Extend `src/__tests__/installation-isolation-probe.test.ts` with the unified-contract rows (FR-011): same-anchor-for-all-sub-steps (govern), `--at` uniformity across state-writing verbs, wording-class rule, no-overlap detection — the probe is the permanent enforcement; these rows are regression insurance, written AFTER stories so they pin the delivered behavior end-to-end
- [ ] T034 Amend `.specify/memory/constitution.md` 1.3.0 → 1.4.0 (research R10): domain definition, no-overlap invariant, domain-complete configuration, deletion of the implicit nested-installation allowance; Sync Impact Report header per Governance; same-PR as the behavior
- [ ] T035 [P] Line-cap verification (Principle VI): `src/subcommands/govern.ts` and `src/govern/payload-implement.ts` at or trending under 500 after T009–T011/T028–T029 extractions; if either remains over, extract the next cohesive module (do NOT defer with a comment)
- [ ] T036 [P] Run quickstart.md V1–V7 end-to-end against the built feature; record results in `specs/016-anchor-unification/quickstart-results.md`
- [ ] T037 Update skill docs that describe the changed surfaces: `skills/backlog/SKILL.md` (`--at` on all verbs; the "which backlog" paragraph), `skills/setup/SKILL.md` (seeding + overlap refusal), `skills/session-start/SKILL.md` if it names anchoring; commit + push
- [ ] T038 Backlog burn-down bookkeeping: mark TASK-22/40/49/50/51/52/53/55/56 progressed with evidence (commits) — status transition stays operator-owned

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (Foundational)** blocks everything: T002–T005 first.
- **US1 (Phase 3)**: after Phase 2. MVP.
- **US2 (Phase 4)**: after Phase 2; T016's overlap-refusal wiring depends on T026 (can land as a follow-on edit within US2 if US6 not yet done).
- **US3 (Phase 5)**: after Phase 2; independent of US1/US2.
- **US6 (Phase 6)**: after Phase 2; pulled before US4/US5 so their new fixtures inherit the guard.
- **US4 (Phase 7)**, **US5 (Phase 8)**: after Phase 2; US5's helper swap touches files US1 doesn't, but `backlog.ts` is shared with US3 — serialize T021 before T031's backlog confirmation.
- **Polish (Phase 9)**: T033 after all stories; T034 anytime (lands same PR); T035 after US1+US4; T036 last.

### Parallel Opportunities

- T002/T003 [P]; T006/T007/T008 [P]; T013/T014 [P]; T018/T019/T020 [P]; T031 parallel with US4 tasks (disjoint files); US2, US3, US6 can proceed in parallel post-Phase-2 (disjoint files except setup.ts: T016 ∥ T026 — serialize those two).

---

## Implementation Strategy

**MVP first**: Phase 2 → US1 (the governance hook anchored + self-reference closed) → validate via quickstart V1 → then US2/US3/US6 in parallel, US4/US5, Polish. Each story is an independently testable increment; commit + push at every task boundary (Principle VII). Every fix task is RED-first (Principle I) with the reproduction taken from the named backlog item / audit finding.
