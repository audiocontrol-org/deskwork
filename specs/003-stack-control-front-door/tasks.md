---
description: "Task list for stack-control front door — plugin + native Spec Kit execution"
---

# Tasks: stack-control front door — plugin + native Spec Kit execution

**Input**: Design documents from `specs/003-stack-control-front-door/`

**Prerequisites**: plan.md (required), spec.md (user stories), research.md, data-model.md, contracts/{stackctl-cli,front-door-skills,governance-extension}.md, quickstart.md

**Tests**: REQUIRED. Constitution Principle I (Test-First) is NON-NEGOTIABLE and `plan.md`'s Constitution Check commits every code task to RED-first. Every `stackctl` verb and the governance rehome are written failing, watched fail for the right reason, then made green.

**Organization**: Tasks grouped by user story. MVP = User Story 1 (execute a spec via native Spec Kit, governance firing).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish carry no story label)

## Path Conventions

New **fat plugin, in-tree TS via `tsx`** under `plugins/stack-control/`, mirroring `plugins/dw-lifecycle/`. All paths repo-relative from root (`/Users/orion/work/deskwork-work/pluggable-lifecycle-providers`). Repo lockstep version is currently `0.37.0` (matches `marketplace.json` + every plugin).

---

## Phase 1: Setup (plugin scaffold — shared infrastructure, FR-001)

**Purpose**: Stand up the `stack-control` plugin shell. Folded into this feature per the plan (no separate infra feature). Mirrors `plugins/dw-lifecycle/`'s in-tree layout.

- [ ] T001 Create the `plugins/stack-control/` directory tree per plan.md § Project Structure: subdirs `bin/`, `src/subcommands/`, `src/__tests__/`, `commands/`, `skills/define/`, `skills/extend/`, `skills/execute/`, `spec-kit/`
- [ ] T002 [P] Create `plugins/stack-control/.claude-plugin/plugin.json` — `name: "stack-control"`, `version: "0.37.0"` (repo lockstep, == marketplace.json), `description`, `license: "GPL-3.0-or-later"` (mirror `plugins/dw-lifecycle/.claude-plugin/plugin.json`)
- [ ] T003 [P] Create `plugins/stack-control/package.json` — `name: "@deskwork/plugin-stack-control"` (private workspace pkg), `version: "0.37.0"`, `"type": "module"`, `scripts.test: "vitest run"`, runtime deps mirroring dw-lifecycle's needed subset (`tsx`, `zod`, `yaml`) + dev dep `vitest`
- [ ] T004 [P] Create `plugins/stack-control/tsconfig.json` mirroring `plugins/dw-lifecycle/tsconfig.json` (TS 5.6 strict, ESM, no `any`/`as`/`@ts-ignore`)
- [ ] T005 [P] Create `plugins/stack-control/vitest.config.ts` mirroring `plugins/dw-lifecycle/vitest.config.ts`
- [ ] T006 Create `plugins/stack-control/bin/stackctl` bash shim (mirror `plugins/dw-lifecycle/bin/dw-lifecycle` resolution order: workspace-hoist tsx → adopter post-install → first-run npm install; `exec tsx src/cli.ts "$@"`); `chmod +x`
- [ ] T007 Create `plugins/stack-control/src/cli.ts` dispatcher skeleton (dispatch on `<verb>`; unknown verb → exit 2 with usage line listing known verbs; no flag silently ignored — per contracts/stackctl-cli.md § Dispatcher)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The `stackctl` dispatcher + `version` verb (every story invokes `stackctl`; SC-001 needs `stackctl version`), plus marketplace/version-sweep/workspace wiring so the plugin is a real, installable plugin.

**⚠️ CRITICAL**: No user-story verb (execute-check / spec-check) or skill work proceeds until the dispatcher resolves and tests run green.

- [ ] T008 [P] RED: dispatcher test in `plugins/stack-control/src/__tests__/cli.test.ts` — unknown verb → exit 2 + usage line; no-arg → usage. Watch it fail for the right reason.
- [ ] T009 [P] RED: `version` verb test in `plugins/stack-control/src/__tests__/version.test.ts` — `stackctl version` prints the value from `.claude-plugin/plugin.json#version`, exit 0. Watch it fail.
- [ ] T010 GREEN: implement the dispatcher in `plugins/stack-control/src/cli.ts` (satisfies T008; depends on T007)
- [ ] T011 [P] GREEN: implement `plugins/stack-control/src/subcommands/version.ts` (reads plugin.json version; satisfies T009)
- [ ] T012 Register stack-control in `.claude-plugin/marketplace.json` — add a `plugins[]` git-subdir entry (`path: plugins/stack-control`, `ref`/`version` at the lockstep `0.37.0`), mirroring the existing dw-lifecycle entry
- [ ] T013 Add stack-control to the version sweep in `scripts/bump-version.ts` MANIFESTS — `plugins/stack-control/package.json` (kind `package-json`, like dw-lifecycle — NOT npm-published) + `plugins/stack-control/.claude-plugin/plugin.json` (kind `plugin-json`). (marketplace-json handler already sweeps all plugin entries.)
- [ ] T014 Verify root `npm install` picks up `plugins/stack-control` as a workspace (root `package.json` already globs `plugins/*`); confirm `node_modules/@deskwork/plugin-stack-control` workspace symlink resolves and `plugins/stack-control/bin/stackctl version` runs via hoisted `tsx`

**Checkpoint**: `stackctl` resolves and dispatches; `version` green; plugin registered + in the lockstep sweep. SC-001 (stackctl available) groundwork laid.

---

## Phase 3: User Story 1 - Execute a spec via native Spec Kit, governance firing (Priority: P1) 🎯 MVP

**Goal**: Point the front door at a runnable Spec Kit spec, drive native `/speckit-implement` via the in-session agent, and have the rehomed governance extension fire automatically on `after_implement` — provider-neutral.

**Independent Test**: From a loaded stack-control plugin, point `/stack-control:execute` at a small spec; observe native execution run and governance fire automatically afterward, findings recorded — 0 manual barrage invocations.

### Tests for User Story 1 (RED-first — write and watch FAIL before implementation) ⚠️

- [ ] T015 [P] [US1] RED: `execute-check` unit tests in `plugins/stack-control/src/__tests__/execute-check.test.ts` — runnable spec → exit 0; missing `tasks.md` → exit ≠0 + stderr names the gap (`tasks.md missing; spec not runnable`); spec dir absent → exit ≠0 descriptive; missing `--spec` → exit 2. Never exit 0 on non-runnable; never fabricate a verdict (FR-008 / Principle V / VR-1). Use a tmp fixture spec tree (no fs mocks — testing rule).
- [ ] T016 [P] [US1] RED: governance neutrality test in `plugins/stack-control/src/__tests__/governance-neutrality.test.ts` — grep `plugins/stack-control/spec-kit/deskwork-governance/scripts/bash/govern.sh` + the command body for authoring/execution tool-identity strings → **0** matches (SC-004 / Principle III / VR-3). Will fail until the rehome (T018) lands.

### Implementation for User Story 1

- [ ] T017 [US1] GREEN: implement `plugins/stack-control/src/subcommands/execute-check.ts` (reads spec dir, validates the artifact set native `/speckit-implement` consumes — at minimum `tasks.md`; fail-loud, read-only; satisfies T015; register verb in `src/cli.ts`)
- [ ] T018 [US1] Rehome governance (physical move, preserves history): `git mv plugins/dw-lifecycle/spec-kit/deskwork-governance plugins/stack-control/spec-kit/deskwork-governance` (extension.yml, README.md, commands/speckit.deskwork-governance.govern.md, scripts/bash/govern.sh). Old dw-lifecycle path must no longer exist. (Satisfies T016.)
- [ ] T019 [US1] Repoint `scripts/smoke-governance-after-implement.sh` — `GOVERN="plugins/stack-control/spec-kit/deskwork-governance/scripts/bash/govern.sh"`
- [ ] T020 [US1] Re-install the extension into `.specify/extensions/deskwork-governance` from the new source (`specify extension add … --dev --force`); confirm `.specify/extensions.yml#hooks.after_implement` still names `speckit.deskwork-governance.govern` (`optional: false`) and `specify extension list` shows it enabled
- [ ] T021 [US1] Author `plugins/stack-control/skills/execute/SKILL.md` + `plugins/stack-control/commands/execute.md` per contracts/front-door-skills.md § execute: resolve spec dir → `stackctl execute-check` (STOP + surface error verbatim on fail, no partial run) → drive native `/speckit-implement` via the in-session agent (NO headless shell-out) → confirm `after_implement` governance fired, surface run-dir/findings (skill does NOT manually invoke governance)
- [ ] T022 [US1] Run `bash scripts/smoke-governance-after-implement.sh` green from the new home: new run-dir under `.dw-lifecycle/scope-discovery/audit-runs/`, `INDEX.md` lists ≥2 model lanes, findings appended to the feature `audit-log.md`, exit 0 (quickstart Scenario D)

**Checkpoint**: MVP complete — execute drives native Spec Kit with governance firing automatically, provider-neutral. US1 independently testable.

---

## Phase 4: User Story 2 - Author a spec through the front door — `define` / `extend` (Priority: P2)

**Goal**: Full create / edit / iterate / review loop over a Spec Kit spec, in-session, via `define` (new) and `extend` (existing) — spec-authoring only (infra creation NOT folded in).

**Independent Test**: Through the front door, `define` a new spec (or `extend` an existing one) and bring it to a state where `/stack-control:execute`'s `execute-check` passes — without leaving the session.

### Tests for User Story 2 (RED-first) ⚠️

- [ ] T023 [P] [US2] RED: `spec-check` unit tests in `plugins/stack-control/src/__tests__/spec-check.test.ts` — reports presence of `spec.md`/`plan.md`/`tasks.md` as a machine-readable line (e.g. `spec=yes plan=yes tasks=no`), exit 0, read-only; missing `--spec` → exit 2; spec dir absent → exit ≠0 descriptive. Tmp fixture trees. Watch it fail.

### Implementation for User Story 2

- [ ] T024 [US2] GREEN: implement `plugins/stack-control/src/subcommands/spec-check.ts` (satisfies T023; register verb in `src/cli.ts`)
- [ ] T025 [P] [US2] Author `plugins/stack-control/skills/define/SKILL.md` + `plugins/stack-control/commands/define.md` per contracts/front-door-skills.md § define: drive native `/speckit-specify` (+ downstream chain) via in-session agent to create a NEW spec; call `stackctl spec-check` to confirm state; spec-authoring ONLY (no worktree/docs infra — `define` ≠ `setup`)
- [ ] T026 [P] [US2] Author `plugins/stack-control/skills/extend/SKILL.md` + `plugins/stack-control/commands/extend.md` per contracts/front-door-skills.md § extend: `stackctl spec-check` → edit/iterate/review loop over the EXISTING spec (`/speckit-clarify`, re-`/speckit-plan`, re-`/speckit-tasks`, edits) reusing the current spec dir → bring to runnable (so execute-check passes), in-session

**Checkpoint**: US1 + US2 both work. The front door is a usable control plane (author + run), not a bare execution trigger.

---

## Phase 5: User Story 3 - stack-control ships as its own plugin without destabilizing dw-lifecycle (Priority: P2)

**Goal**: stack-control installs as its own plugin (stackctl available, lockstep version), governance registered from the new home, and `dw-lifecycle` unchanged (isolation invariant).

**Independent Test**: Install stack-control; confirm `stackctl` runs + governance registered from the stack-control tree; exercise dw-lifecycle's surfaces and confirm 0 behavior change.

### Tests / verifications for User Story 3 ⚠️

- [ ] T027 [P] [US3] Isolation grep (VR-2 / R5): `grep -rn "deskwork-governance\|spec-kit/" plugins/dw-lifecycle/{src,bin,commands,skills}` → **0 matches** (no inbound coupling from dw-lifecycle to the moved extension). Encode as a guard test or quickstart Scenario E step.

### Verification for User Story 3

- [ ] T028 [US3] `claude plugin validate plugins/stack-control` passes; `plugins/stack-control/bin/stackctl version` prints the lockstep version (matches marketplace.json) — SC-001 / quickstart Scenario A
- [ ] T029 [US3] `specify extension list` shows `deskwork-governance` enabled from the new home; old `plugins/dw-lifecycle/spec-kit/deskwork-governance/` no longer exists — SC-001 / quickstart Scenario B
- [ ] T030 [US3] `npm --workspace @deskwork/plugin-dw-lifecycle test` passes unchanged (dw-lifecycle suite green before/after the move) — SC-003 / quickstart Scenario E

**Checkpoint**: All three stories independently functional; isolation invariant held.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Docs, self-hosting proof, and stale-reference cleanup spanning the stories.

- [ ] T031 [P] Create `plugins/stack-control/README.md` (purpose, install per repo plugin conventions, the three front-door verbs, the rehomed governance extension; no rot-prone version strings — link the releases page per `.claude/rules/documentation.md`)
- [ ] T032 [P] Update the slice-001 completion note + any doc citing the old `plugins/dw-lifecycle/spec-kit/deskwork-governance` source path (informational; no behavior change — governance-extension.md § Move mechanics step 4)
- [ ] T033 Self-hosting proof (SC-005 / FR-009 / quickstart Scenario F): through the front door in-session, `/stack-control:extend` advance Feature 2's spec (`specs/002-parallel-execution-engine`) toward runnable (or `/stack-control:define` a new spec), then `/stack-control:execute` it via native Spec Kit with governance firing — demonstrating the door drives subsequent stack-control development
- [ ] T034 Run the full quickstart.md (Scenarios A–F) end-to-end; confirm SC-001..006 coverage

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — start immediately. T002–T005 are [P]; T006/T007 follow the dir tree (T001).
- **Foundational (Phase 2)**: depends on Setup. **BLOCKS all user stories.** T010 depends on T007/T008; T011 [P] with T010. T012–T014 wire the plugin in.
- **User Stories (Phase 3–5)**: all depend on Foundational completion. Independently testable; can proceed in parallel once Foundational is done.
- **Polish (Phase 6)**: depends on the user stories it validates (T033/T034 need US1+US2 skills present).

### User-story dependencies

- **US1 (P1, MVP)**: after Foundational. The governance rehome (T018) is internal to US1. No dependency on US2/US3.
- **US2 (P2)**: after Foundational. `spec-check` (T024) is independent of US1's `execute-check`. The `extend` skill (T026) brings a spec to a state US1's `execute-check` accepts, but US2 is testable on its own (spec-check + skill bodies).
- **US3 (P2)**: its isolation/registration checks (T027–T030) assume the rehome (T018) has happened — so US3 verification runs after US1's T018, but US3 carries no new implementation, only validation.

### Within each story

- Tests (RED) before implementation (GREEN) — Principle I, NON-NEGOTIABLE.
- Subcommand modules before the skills that call them.
- Each story complete + independently testable before moving to the next priority.

### Parallel opportunities

- Setup config files: **T002, T003, T004, T005** in parallel (distinct files).
- Foundational tests: **T008, T009** in parallel; **T011** parallel with T010.
- US1 tests: **T015, T016** in parallel.
- US2 skills: **T025, T026** in parallel (distinct skill dirs).
- Polish: **T031, T032** in parallel.
- Once Foundational lands, **US1 / US2 / US3** can be staffed in parallel (US3 verification waits on US1's T018).

---

## Parallel Example: Setup + US1 tests

```bash
# Phase 1 config files together:
Task: "Create plugins/stack-control/.claude-plugin/plugin.json"
Task: "Create plugins/stack-control/package.json"
Task: "Create plugins/stack-control/tsconfig.json"
Task: "Create plugins/stack-control/vitest.config.ts"

# US1 RED tests together (before any implementation):
Task: "execute-check unit tests in src/__tests__/execute-check.test.ts"
Task: "governance neutrality test in src/__tests__/governance-neutrality.test.ts"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1: Setup (plugin scaffold).
2. Phase 2: Foundational (dispatcher + version + marketplace/version/workspace wiring). **CRITICAL — blocks all stories.**
3. Phase 3: US1 (execute-check + governance rehome + execute skill + smoke green).
4. **STOP and VALIDATE**: run quickstart Scenarios A, C, D — execute drives native Spec Kit, governance fires automatically, neutral. This is the self-hosting bootstrap.

### Incremental delivery

1. Setup + Foundational → plugin resolves.
2. US1 → execute + governance (MVP — the bootstrap capability).
3. US2 → define/extend authoring (front door becomes self-contained).
4. US3 → isolation/registration verification (invariant held).
5. Polish → README, stale-ref cleanup, self-hosting proof (drive Feature 2's spec through the door).

---

## Notes

- [P] = different files, no incomplete dependencies. [Story] label maps each task to a user story for traceability.
- Tests are RED-first and use tmp fixture trees, never fs mocks (`.claude/rules/testing.md`).
- **Isolation invariant (VR-2)**: no file under `plugins/dw-lifecycle/{src,bin,commands,skills,templates}` is modified — only the governance source tree *leaves* dw-lifecycle via `git mv`. Surface any conflict rather than regress dw-lifecycle.
- Commit + push per logical change (Principle VII); no AI attribution (project rule).
- No new CI test additions — smokes are local-only, run pre-PR/pre-tag (project rule).
- Governance's outbound seam to `dw-lifecycle audit-barrage*` stays cross-plugin until a later migration feature; absence fails loud, never silent.
