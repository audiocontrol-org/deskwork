# Tasks: deskwork governance as a Spec Kit `after_implement` extension

**Feature**: 001-speckit-backhalf-slice | **Branch**: `feature/pluggable-lifecycle-providers`
**Inputs**: `plan.md`, `spec.md`, `data-model.md`, `contracts/governance-extension.contract.md`, `research.md`

**Test policy**: TDD is mandatory (constitution Principle I) — the integration smoke is written failing first, then made green.

**Conventions**: `[P]` = parallelizable (different files, no incomplete-task dependency). `[US1]`/`[US2]` map to the spec's user stories. Setup/Foundational/Polish phases carry no story label.

---

## Phase 1: Setup

- [ ] T001 Scaffold the extension directory and author the manifest per Contract A in `.specify/extensions/deskwork-governance/extension.yml` (id, requires `dw-lifecycle`+`git`, `provides.commands` entry only — hook wired in T009)
- [ ] T002 [P] Create the command-body stub at `.specify/extensions/deskwork-governance/commands/speckit.deskwork.govern.md` (frontmatter + placeholder body)
- [ ] T003 [P] Create the orchestration script skeleton (exits non-zero, no logic yet) at `.specify/extensions/deskwork-governance/scripts/bash/govern.sh`
- [ ] T004 [P] Create `.specify/extensions/deskwork-governance/README.md` (purpose, install command, teardown)

## Phase 2: Foundational (blocks all user stories)

- [ ] T005 Install the extension locally and confirm registration: `specify extension add .specify/extensions/deskwork-governance --dev --force`; assert `specify extension list` shows `deskwork-governance` enabled and `.specify/extensions/.registry` records its command

## Phase 3: User Story 1 — governance fires automatically after implement (P1) 🎯 MVP

**Goal**: after `/speckit-implement` completes, deskwork's cross-model audit-barrage + finding lift run automatically via `after_implement`, with no provider-name branching.
**Independent test**: invoke the governance path over a known diff and observe a run-dir (≥2 lanes) + findings in `audit-log.md`, with zero manual barrage invocation.

- [ ] T006 [US1] Write the FAILING integration smoke at `scripts/smoke-governance-after-implement.sh` that, given a sample diff, invokes **`govern.sh` directly** (the command body is an agent-invoked Claude skill and is not headlessly callable — the smoke exercises the deterministic orchestration script, not the agent command) and asserts (a) a new run-dir under `.dw-lifecycle/scope-discovery/audit-runs/`, (b) `INDEX.md` lists ≥2 model lanes, (c) findings appended to `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/audit-log.md`. Run it; confirm it FAILS (RED) because `govern.sh` is a skeleton.
- [ ] T007 [US1] Implement the orchestration in `.specify/extensions/deskwork-governance/scripts/bash/govern.sh`: capture `git diff` + `git diff --stat`, assemble the vars JSON (`feature_slug`, `diff`, `workplan_summary`, `audit_log_excerpt`, `commit_subjects`), then `dw-lifecycle audit-barrage-render` → `RUN_DIR=$(dw-lifecycle audit-barrage --output-run-dir)` → `dw-lifecycle audit-barrage-lift --run-dir "$RUN_DIR" --apply`. Fail loudly if `dw-lifecycle` is absent (no silent skip — constitution V).
- [ ] T008 [US1] Author the command body `.specify/extensions/deskwork-governance/commands/speckit.deskwork.govern.md` to invoke `scripts/bash/govern.sh` and surface its result (per Contract C).
- [ ] T009 [US1] Add `hooks.after_implement → speckit.deskwork.govern` to `.specify/extensions/deskwork-governance/extension.yml`; re-install (`specify extension add … --dev --force`); assert `.specify/extensions.yml` now has the `after_implement` entry naming the command (Contract B).
- [ ] T010 [US1] Make the smoke GREEN: run `scripts/smoke-governance-after-implement.sh` and confirm run-dir + ≥2 lanes (claude+codex) + findings lifted (SC-002/004 via `govern.sh`). Note: SC-001 ("fires automatically, zero manual invocation") is verified separately by the **manual `/speckit-implement` run in `quickstart.md`** — the headless smoke proves the orchestration, the quickstart proves the hook firing.
- [ ] T011 [P] [US1] Add a provider-neutrality grep gate to the smoke: assert zero authoring/execution tool-name string matches in `govern.sh` + the command body (SC-003 / constitution III).

## Phase 4: User Story 2 — learn the extension seam (P2)

**Goal**: capture what the governance command consumed from Spec Kit and how its command name resolved, as the bridge's evidence.
**Independent test**: a written seam record exists covering context-consumed + command-name resolution.

- [ ] T012 [US2] Append TF-09 to `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/tooling-feedback.md` recording (a) the context `govern.sh` consumed (diff/plan/feature-dir), and (b) the command-name resolution (`speckit.deskwork.govern` → `/speckit-deskwork-govern`, shelling to the `dw-lifecycle` CLI) — closes SC-005.

## Phase 5: Polish & Cross-Cutting

- [ ] T013 [P] Document teardown + edge behavior (empty diff → runs/reports no defects, exits 0; `dw-lifecycle` absent → fails loud) in the extension `README.md` and `quickstart.md`.
- [ ] T014 [P] Run `quickstart.md` end-to-end and record SC-001..005 evidence (run-dir path, lane count, finding IDs) in the slice's completion note.

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2: T005 install)** → **US1 (P3)** → **US2 (P4)** → **Polish (P5)**.
- Within US1: T006 (failing test) BEFORE T007/T008 (implementation); T009 wiring after the command exists; T010 green after wiring; T011 grep gate can run alongside once `govern.sh` exists.
- US2 (T012) depends on US1 being green (the seam is learned from the working command).

## Parallel Opportunities

- T002, T003, T004 — different files, run in parallel after T001.
- T011 — independent check, parallel with T010's verification.
- T013, T014 — different files, parallel.

## Implementation Strategy

**MVP = User Story 1** (T001–T011): governance fires automatically over a foreign plan, cross-model, no provider branching. Stop and validate independently before US2.
**Then** US2 (seam record) + Polish.
