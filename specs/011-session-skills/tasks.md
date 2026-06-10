---
description: "Task list for 011-session-skills"
---

# Tasks: Native session-start / session-end lifecycle skills (session-skills)

**Input**: Design documents from `specs/011-session-skills/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md
**Tests**: RED-first is **mandatory** (constitution Principle I) — every implementation task is preceded by a failing test seen failing for the expected reason.
**Branch**: `feature/stack-control` (one long-lived program branch).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency).
- **[Story]**: user story the task serves (US1–US5). Setup/Foundational/Polish carry no story label.
- Paths are repo-relative; source lives under `plugins/stack-control/`.

## Path conventions

Source: `plugins/stack-control/src/…` · Tests: `plugins/stack-control/tests/session/…` · Schema: `plugins/stack-control/schema/…` · Skills: `plugins/stack-control/skills/…` · Dogfood config: repo-root `.stack-control/config.yaml`.

## Dependency on 009's shared config port (read first)

This feature **consumes** 009's `src/config/{installation,resolve-paths,config-loader,types}.ts` and **extends** its key set. Per plan § Dependency-sequencing note, the build-order vs 009 is an **operator/roadmap call** (T037): if 009 has landed, Phase 1 edits its files; if session-skills lands first, the upward-walk resolver + loader read-subset must be built as a prerequisite (operator decision). Phase 1 tasks below assume the port is present.

---

## Phase 1: Setup (config extension)

- [X] T001 [P] Extend `plugins/stack-control/src/config/types.ts` — add `journal | tooling_feedback | clone_scope` to the `WorkingFileKey` union and the corresponding `journal` / `toolingFeedback` / `cloneScope` fields to `ResolvedPaths` (types only, per data-model.md §1).
- [X] T002 [P] Extend `plugins/stack-control/schema/stackctl-config.yaml.schema.json` — add `paths.{journal,tooling_feedback,clone_scope}` (optional strings, `additionalProperties: false` preserved), per `contracts/session-config-extension.md`.
- [X] T003 [P] Add audience-split defaults for the three keys to `plugins/stack-control/src/config/resolve-paths.ts` default map: `journal` → root `DEVELOPMENT-NOTES.md`, `tooling_feedback` → root `tooling-feedback.md`, `clone_scope` → root `.` (dir). No change to the resolver/precedence algorithm.

---

## Phase 2: Foundational — git primitives (BLOCKS US2 + US4)

> Both branch-staleness (US4) and the journal boundary + commit/push (US2) sit on git. Build RED-first; extend the existing `src/repo.ts` rather than a second git layer (plan Structure Decision).

- [X] T004 [P] RED: `plugins/stack-control/tests/session/git.test.ts` — `resolveBase()` returns the configured upstream when set, else the repo default branch, else `undeterminable`; `aheadBehind(base)` returns the behind count; detached HEAD / no-upstream-no-default → `undeterminable`; `sessionBoundary(--since?)` resolves explicit → merge-base-with-base → `HEAD~N`.
- [X] T005 Implement the git helpers in `plugins/stack-control/src/session/git.ts` (re-exporting/reusing `src/repo.ts` `execSync` precedent): `resolveBase`, `aheadBehind`, `sessionBoundary` → GREEN T004.

**Checkpoint**: base resolution + ahead/behind + session-boundary SHA available to US2/US4.

---

## Phase 3: User Story 1 — Fresh agent oriented at boot, and stops (Priority: P1) 🎯 MVP

**Goal**: `stackctl session-start` resolves the installation, reports roadmap + active-spec chain position + latest journal + open backlog, and STOPS (read-only). No staleness yet (US4) and cwd-resolved only (US3 adds `--at`).
**Independent test**: configured installation with roadmap + active spec + prior journal → `session-start` reports all four and takes no action (quickstart Scenarios 1–3).

- [X] T006 [P] [US1] RED: `plugins/stack-control/tests/session/chain-position.test.ts` — present-artifact-set → next `/speckit-*` step (plan-no-tasks → tasks; tasks → analyze/implement); missing `.specify/feature.json` → `null`; partial chain inferred (FR-003/FR-005).
- [X] T007 [P] [US1] RED: `plugins/stack-control/tests/session/orient.test.ts` — assembles roadmap ready/blocked (006 reasoner), latest journal entry, and open backlog items (008 `list()`), all read through the resolved config paths; **asserts no GitHub-issue query** (FR-001).
- [X] T008 [P] [US1] RED: `plugins/stack-control/tests/session/start-readonly.test.ts` — `session-start` produces 0 on-disk changes (SC-008); re-run identical; STOP (invokes no `/speckit-*` step, FR-002/FR-021); fails loud (exit 1) when run outside any installation (FR-014).
- [X] T009 [US1] Implement `plugins/stack-control/src/session/chain-position.ts` (pure: read `.specify/feature.json`, inspect artifact set, infer next step) → GREEN T006.
- [X] T010 [US1] Implement `plugins/stack-control/src/session/orient.ts` (compose roadmap reasoner + backlog `list()` + latest-journal read; all via `resolvePaths`) → GREEN T007.
- [X] T011 [US1] Implement `plugins/stack-control/src/session/report.ts` (render `OrientationReport`; staleness slot omitted until US4; `--json` shape).
- [X] T012 [US1] Implement `plugins/stack-control/src/subcommands/session-start.ts` — `runSessionStartCli`: `resolveInstallation(cwd)`, orient, report, read-only, fail-loud outside installation, exit 0/1/2 (contracts/session-start-cli.md) → GREEN T008.
- [X] T013 [US1] Register `session-start: runSessionStartCli` in `plugins/stack-control/src/cli.ts` SUBCOMMANDS.
- [X] T014 [US1] Create `plugins/stack-control/skills/session-start/SKILL.md` — thin adapter over the CLI (when to run; report-and-stop discipline; CLI-first note).

**Checkpoint**: US1 independently testable — a fresh agent is oriented and stops. **This is the MVP.**

---

## Phase 4: User Story 2 — Close captured + committed + pushed (Priority: P1)

**Goal**: `stackctl session-end` writes the journal (auto-mechanical + narrative slots), captures friction, runs the advisory clone-snapshot, surfaces progressed backlog, and commits + pushes. **Independent test**: session with a commit + a local bare remote → `session-end` → journal appended, pushed, progressed backlog surfaced (quickstart Scenarios 4–6).

- [ ] T015 [P] [US2] RED: `plugins/stack-control/tests/session/end-journal.test.ts` — auto-derived mechanical sections (commit count/subjects, files-changed, backlog-items-touched) from `git log <boundary>..HEAD` + empty narrative slots; an honest sparse entry on a no-op session; written at the configured `journal` path; follows configured template else default (FR-006/FR-013).
- [ ] T016 [P] [US2] RED: `plugins/stack-control/tests/session/progressed-backlog.test.ts` — backlog items referenced in session commits surfaced as progressed; backlog store status **unchanged** (0 auto-transitions); **no GitHub-issue query** (FR-009/SC-006).
- [ ] T017 [P] [US2] RED: `plugins/stack-control/tests/session/end-commit-push.test.ts` — stages + commits doc-only; pushes to a local **bare** remote (assert commit present after re-fetch); warns (not blocks) on uncommitted non-doc changes (FR-011); push failure → exit 3, record committed locally (FR-010).
- [ ] T018 [US2] Implement `plugins/stack-control/src/session/journal.ts` (auto-derive mechanical via T005 boundary + git log; emit narrative slots; configured-template-or-default) → GREEN T015.
- [ ] T019 [US2] Implement `plugins/stack-control/src/session/progressed-backlog.ts` (commit-ref IDs ∩ backlog `list()`; surface-only) → GREEN T016.
- [ ] T020 [US2] Implement `plugins/stack-control/src/session/close.ts` — tooling-friction append (resolved `tooling_feedback`, skip-clean if none) + advisory clone-snapshot over resolved `clone_scope` (skip-with-note if unconfigured/tool-absent).
- [ ] T021 [US2] Implement `plugins/stack-control/src/subcommands/session-end.ts` — `runSessionEndCli`: resolve, journal, close (friction + snapshot), progressed-backlog, commit + push (bounded retry, `--no-push`), report, exit 0/1/2/3 (contracts/session-end-cli.md) → GREEN T017.
- [ ] T022 [US2] Register `session-end: runSessionEndCli` in `plugins/stack-control/src/cli.ts` SUBCOMMANDS.
- [ ] T023 [US2] Create `plugins/stack-control/skills/session-end/SKILL.md` — thin adapter (when to run; capture-only discipline; CLI-first note).

**Checkpoint**: US2 independently testable — a session's record is durably captured + pushed.

---

## Phase 5: User Story 3 — Works in any project, no hardcoded conventions (Priority: P1)

**Goal**: both verbs resolve every working file through config at any configured location, fail loud outside an installation, and honor the nearest-enclosing + `--at` override. **Independent test**: custom locations honored; outside-installation fails loud; monorepo isolation (quickstart Scenarios 8–9).

- [ ] T024 [P] [US3] RED: `plugins/stack-control/tests/session/decoupling.test.ts` — both verbs read/write at non-default configured locations (journal/roadmap/clone_scope); running either outside any installation fails loud naming the missing installation, **no bundled-copy fallback** (FR-012/FR-014/SC-003/SC-004).
- [ ] T025 [P] [US3] RED: `plugins/stack-control/tests/session/monorepo.test.ts` — two installations at distinct subtrees: a verb run in one resolves the **nearest** enclosing installation and leaves the sibling's files unchanged; `--at <other>` orients on the other (FR-015/SC-009).
- [ ] T026 [US3] Add the `--at <dir>` override to both `session-start.ts` and `session-end.ts` (surface-agnostic context → `resolveInstallation`), and audit both verbs for any residual hardcoded path (all reads/writes through `resolvePaths`) → GREEN T024/T025.

**Checkpoint**: the native decoupling (#122) is proven on a non-deskwork layout.

---

## Phase 6: User Story 4 — Branch-staleness advisory (Priority: P2)

**Goal**: session-start warns when the branch is behind its base; advisory, never blocks. **Independent test**: behind → advisory; level → none; undeterminable → clean skip (quickstart Scenario 7).

- [ ] T027 [P] [US4] RED: `plugins/stack-control/tests/session/staleness.test.ts` — branch behind base → advisory with count; level/ahead → no warning; detached/no-base → clean skip note; in **all** cases the session still starts (FR-016/FR-017/SC-005).
- [ ] T028 [US4] Implement `plugins/stack-control/src/session/staleness.ts` (base via T005 `resolveBase`; `aheadBehind`; `StalenessSignal` skip-clean) → GREEN T027.
- [ ] T029 [US4] Wire the `StalenessSignal` into `orient.ts`'s `OrientationReport` and `report.ts` rendering (the previously-omitted slot).

---

## Phase 7: User Story 5 — CLI-first plain-shell parity (Priority: P2)

**Goal**: both verbs run in a plain shell with no Claude Code surface; skills are pure adapters. **Independent test**: plain-shell run equals skill-path output (quickstart Scenario 10).

- [ ] T030 [P] [US5] RED: `plugins/stack-control/tests/session/cli-first.test.ts` — `runCli(['session-start'])` / `runCli(['session-end'])` complete in a plain shell (no Claude Code) producing the report/record; assert the skills add no behavior the CLI lacks (FR-018/FR-019/SC-007).
- [ ] T031 [US5] Confirm both verbs + both SKILL.md adapters satisfy CLI-first (no Claude-Code-only path; skills only quote the verb) → GREEN T030.

---

## Phase 8: Polish & cross-cutting

- [ ] T032 [P] Execute quickstart.md Scenarios 1–10 in a **plain shell** (no Claude Code surface) and record outcomes (SC-007).
- [ ] T033 [P] `tsc` strict + lint clean (no `any`/`as`/`@ts-ignore`); confirm every new module ≤ 500 lines (Principle VI).
- [ ] T034 [P] Add the three new key overrides to the repo-root dogfood `.stack-control/config.yaml` — `journal` → `DEVELOPMENT-NOTES.md`, `tooling_feedback` → `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/tooling-feedback.md`, `clone_scope` → `plugins/stack-control` — and verify the plugin's own session verbs resolve through it (research D9).
- [ ] T035 Run `bash .dw-lifecycle/scope-discovery/clone-snapshot.sh`; refactor or justify any NEW clone (watch `src/session/git.ts` vs `src/repo.ts`; `orient.ts` readers vs existing inbox/roadmap readers).
- [ ] T036 Update `plugins/stack-control/README.md` (+ the two new SKILL.md) documenting `stackctl session-start` / `session-end` and the three `.stack-control/config.yaml` keys; note CLI-first / surface-agnostic resolution.
- [ ] T037 Surface to the operator (do NOT auto-decide): (a) the **009 build-order sequencing** (plan § Dependency-sequencing) and (b) the **backlog changed-since** question (plan § Scope-coordination) — for a `roadmap reconcile` decision.

---

## Dependencies & execution order

- **Phase 1 (T001–T003)** extends 009's config port → blocks every read/write resolution.
- **Phase 2 (T004–T005, git)** blocks US2 (boundary/commit/push) + US4 (staleness).
- **US1 (Phase 3)** is the MVP and first independently shippable increment (cwd-resolved, no staleness).
- **US2 (Phase 4)** depends on Phase 2 git + US1's verb-shell pattern.
- **US3 (Phase 5)** depends on US1+US2 existing (it pins their decoupling + adds `--at`).
- **US4 (Phase 6)** depends on Phase 2 git + US1's report/orient (adds the staleness slot).
- **US5 (Phase 7)** depends on both verbs existing.
- **Polish (Phase 8)** last.

### Parallel opportunities

- Setup: T001 ‖ T002 ‖ T003.
- US1 RED: T006 ‖ T007 ‖ T008 (then impl T009/T010/T011/T012, each after its RED).
- US2 RED: T015 ‖ T016 ‖ T017.
- US3 RED: T024 ‖ T025.
- Polish: T032 ‖ T033 ‖ T034.

## Implementation strategy

- **MVP = US1** (Phase 1 → 2 → 3): a fresh agent is oriented and stops, resolving through config. Independently demoable.
- Then layer US2 (capture-at-close), US3 (decoupling proof + `--at`), US4 (staleness), US5 (CLI-first parity) — each a small, independently-testable increment behind the same config port.
- Commit RED then GREEN per task pair; push at task boundaries (Principle VII).
- Before/early in implementation, resolve T037's two surfaced operator calls (009 sequencing; backlog changed-since).
