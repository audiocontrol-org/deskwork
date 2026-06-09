---
description: "Task list for 009-project-doc-setup"
---

# Tasks: Post-Install Project Setup (project-doc-setup)

**Input**: Design documents from `specs/009-project-doc-setup/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md
**Tests**: RED-first is **mandatory** (constitution Principle I) — every implementation task is preceded by a failing test seen failing for the expected reason.
**Branch**: `feature/stack-control` (one long-lived program branch).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency).
- **[Story]**: user story the task serves (US1–US5). Setup/Foundational/Polish carry no story label.
- Paths are repo-relative; source lives under `plugins/stack-control/`.

## Path conventions

Source: `plugins/stack-control/src/…` · Tests: `plugins/stack-control/tests/…` · Schema: `plugins/stack-control/schema/…` · Skill: `plugins/stack-control/skills/…` · Dogfood config: repo-root `.stack-control/config.yaml`.

---

## Phase 1: Setup (project initialization)

- [X] T001 [P] Create `plugins/stack-control/src/config/types.ts` with the interfaces from data-model.md (`InstallationConfig`, `WorkingFileKey`, `ResolvedPaths`, `Installation`, `SetupItem`, `SetupReport`) — types only, no logic.
- [X] T002 [P] Create `plugins/stack-control/schema/stackctl-config.yaml.schema.json` mirroring `schema/audit-barrage-config.yaml.schema.json`: `version` (positive int, required), optional `base_dir`, optional `paths.{roadmap,inbox,backlog,audit_log,feature_audit_log_pattern}`, `additionalProperties: false`, per contracts/stackctl-config.md.

---

## Phase 2: Foundational — the shared config + resolution port (BLOCKS all user stories)

> This is the Principle-II port both the create-side and read-side depend on. Build it RED-first; nothing in Phase 3+ resolves a working file without it.

- [X] T003 [P] RED: `plugins/stack-control/tests/config/config-loader.test.ts` — valid YAML parses snake→camel; fail-loud on bad/unknown `version`, unknown top-level key, `base_dir`/`paths.*` escaping the root, and `feature_audit_log_pattern` missing the literal `{feature}`.
- [X] T004 [P] RED: `plugins/stack-control/tests/config/installation.test.ts` — `resolveInstallation(startDir)` upward-walks to the nearest enclosing `.stack-control/config.yaml`; nearest-wins on nesting; no-match fails loud naming the start dir; accepts an explicit start dir (surface-agnostic, FR-026).
- [X] T005 [P] RED: `plugins/stack-control/tests/config/resolve-paths.test.ts` — precedence per-file override > `base_dir` > audience-split default; within-root containment enforced; cross-key collision and root-escape both refused (FR-024).
- [X] T006 Implement `plugins/stack-control/src/config/config-loader.ts` (load + validate against the schema; snake→camel translation, mirroring the audit-barrage loader) → GREEN T003.
- [X] T007 Implement `plugins/stack-control/src/config/installation.ts` (`resolveInstallation` upward walk, nearest-wins, fail-loud) → GREEN T004.
- [X] T008 Implement `plugins/stack-control/src/config/resolve-paths.ts` (`resolvePaths` + containment/collision/escape checks) → GREEN T005.

**Checkpoint**: the shared resolver loads, walks, and resolves paths with fail-loud validation. User stories can now build on it.

---

## Phase 3: User Story 1 — Fresh adopter set up in one step (Priority: P1) 🎯 MVP

**Goal**: `stackctl setup` scaffolds a fresh installation; afterward every governed verb resolves the project-local file with no `--doc`. Includes auto-on-first-use and the read-side wiring (FR-003) and the in-repo dogfood (D9).
**Independent test**: empty project → `stackctl setup --apply` → run `roadmap`/`inbox`/`backlog` with no path → all operate on the scaffolded files (quickstart Scenario 1 + 6).

- [ ] T009 [P] [US1] RED: `plugins/stack-control/tests/setup/fresh.test.ts` — empty tmp project → `setup --apply` scaffolds config + roadmap + inbox + backlog + program audit log, all parser-valid; each consuming verb resolves the project-local file (no `--doc`); report lists created items + locations (SC-001/SC-004).
- [ ] T010 [P] [US1] RED: `plugins/stack-control/tests/setup/auto-on-first-use.test.ts` — verb in an installation with files missing scaffolds + announces + proceeds, byte-identical to `setup`'s scaffold; a verb run **outside** any installation fails loud directing to `stackctl setup` (FR-015/016/017, Principle V).
- [ ] T011 [US1] Implement `plugins/stack-control/src/setup/scaffold.ts` — empty-but-valid writers per `WorkingFileKey`: roadmap (heading-keyed, 0 items), inbox (governed + source registry, 0 captures), backlog (`filesystem_only` `config.yml` + dir, reusing 008's init), program audit log (header, 0 findings), config.
- [ ] T012 [US1] Implement `plugins/stack-control/src/setup/verify.ts` — run each consuming parser as the validity oracle; fail loud naming a malformed artifact (basic pass; US5 extends drift handling).
- [ ] T013 [US1] Implement `plugins/stack-control/src/setup/report.ts` — assemble + render `SetupReport`/`SetupItem` (created / already-present / skipped / malformed + locations).
- [ ] T014 [US1] Implement `plugins/stack-control/src/subcommands/setup.ts` — `runSetupCli`: resolve-or-create root (`--at`, cwd), dry-run default / `--apply`, scaffold-missing-only, verify, report, exit 0/1/2 (contracts/setup-cli.md).
- [ ] T015 [US1] Register `setup: runSetupCli` in `plugins/stack-control/src/cli.ts` SUBCOMMANDS.
- [ ] T016 [US1] Read-side wiring: `plugins/stack-control/src/subcommands/inbox.ts` + `roadmap.ts` — `DEFAULT_DOC` resolves via `config/installation` when inside an installation; fail loud (no bundled fallback) when outside; preserve the env seam + `--doc` override.
- [ ] T017 [US1] Read-side wiring: `plugins/stack-control/src/backlog/root.ts` — `backlogRoot()` resolves via config (keep `STACKCTL_BACKLOG_DIR` seam).
- [ ] T018 [US1] Read-side wiring: `plugins/stack-control/src/subcommands/document-verb-shared.ts` — `grammarDirs()` resolves against the installation root (not raw `process.cwd()`).
- [ ] T019 [US1] Wire auto-on-first-use: invoke the shared `scaffold.ts` from the verb read-path when a working file is missing inside an installation; announce; proceed → GREEN T010.
- [ ] T020 [US1] Dogfood (D9): add repo-root `.stack-control/config.yaml` recording the in-repo installation's actual scattered layout (roadmap/inbox under `plugins/stack-control/`, program audit log under `docs/1.0/.../`, backlog under `plugins/stack-control/backlog/`); verify the plugin's own verbs resolve through it (must land WITH T016–T018 or the in-repo verbs break).
- [ ] T021 [US1] Create `plugins/stack-control/skills/setup/SKILL.md` — `/stack-control:setup` thin adapter over the CLI (when to run; CLI-first/surface-agnostic note).

**Checkpoint**: US1 independently testable — a fresh project is one-command-ready and the dogfood resolves through config. **This is the MVP.**

---

## Phase 4: User Story 2 — Re-running setup never destroys content (Priority: P1)

**Goal**: idempotent, non-destructive re-run. **Independent test**: seed partial+content, re-run, assert hash-equality + missing-only-created (quickstart Scenario 2).

- [ ] T022 [P] [US2] RED: `plugins/stack-control/tests/setup/idempotent.test.ts` — pre-existing item content byte-for-byte unchanged (hash equality); partial project completes only the missing items; full re-run is a no-op; report distinguishes created vs already-present (SC-002).
- [ ] T023 [US2] Enforce the scaffold-missing-only + non-destructive guarantees in `setup.ts`/`scaffold.ts` (skip any existing item; never open-for-write an existing file) → GREEN T022.

---

## Phase 5: User Story 3 — Configurable locations (Priority: P1)

**Goal**: each working file relocatable; locations recorded. **Independent test**: custom locations honored + resolved by verbs (quickstart Scenario 3).

- [ ] T024 [P] [US3] RED: `plugins/stack-control/tests/setup/configurable.test.ts` — custom per-file location honored + recorded; unset → audience-split default recorded; an existing file at a non-default location is recorded, not duplicated (SC-007, FR-018/019/020).
- [ ] T025 [US3] In `setup.ts`: write/update the installation config with every resolved location; record an existing non-default file's location rather than scaffolding a duplicate → GREEN T024.

---

## Phase 6: User Story 4 — One repo, multiple isolated installations (Priority: P1)

**Goal**: N installations per repo, fully isolated; nearest-wins; collisions refused. **Independent test**: two installations, capture isolation + re-setup isolation + cross-installation collision refusal (quickstart Scenarios 4 + 7).

- [ ] T026 [P] [US4] RED: `plugins/stack-control/tests/setup/monorepo.test.ts` — two installations at distinct subtrees operate in isolation (a capture in one reaches zero of the other's files); re-setup of one leaves the other hash-unchanged; a verb in a subdir resolves nearest-wins; a configured location escaping the root or colliding with a sibling installation is refused (SC-008, FR-021/022/023/024).
- [ ] T027 [US4] In `setup.ts` + `resolve-paths.ts`: honor `--at` targeting; add cross-installation collision/escape detection (parent scope excludes nested child subtrees) → GREEN T026.

---

## Phase 7: User Story 5 — Setup proves the project is usable (Priority: P2)

**Goal**: malformed/drifted files fail loud, never false-clean. **Independent test**: malformed required file → exit 1 named, not overwritten (quickstart Scenario 5).

- [ ] T028 [P] [US5] RED: `plugins/stack-control/tests/setup/verify.test.ts` — a present-but-malformed required file → exit 1, named, `ready=false`, NOT overwritten (drift surfaced, FR-010); a config pointing at a missing/ unresolvable location is reported; an all-valid project reports ready (SC-005).
- [ ] T029 [US5] Extend `plugins/stack-control/src/setup/verify.ts`: malformed/drift handling (surface, never overwrite) + config-resolves-but-missing detection → GREEN T028.

---

## Phase 8: Polish & cross-cutting

- [ ] T030 [P] Execute quickstart.md Scenarios 1–7 in a **plain shell** (no Claude Code surface) and record outcomes (SC-009).
- [ ] T031 [P] `tsc` strict + lint clean (no `any`/`as`/`@ts-ignore`); confirm every new module ≤ 500 lines (Principle VI).
- [ ] T032 [P] Update `plugins/stack-control/README.md` (+ the new SKILL.md) documenting `stackctl setup` and the `.stack-control/config.yaml` contract; note CLI-first/surface-agnostic resolution.
- [ ] T033 Run `bash .dw-lifecycle/scope-discovery/clone-snapshot.sh`; refactor or justify any NEW clone (watch `config/config-loader.ts` vs the audit-barrage `config-loader.ts` — extract a shared YAML-load helper if duplicated).
- [ ] T034 Surface to the operator (do NOT auto-merge) that `design:gap/project-relative-doc-discovery` is likely subsumed by the read-side wiring landed here — for a `roadmap reconcile` decision (plan § Scope-coordination note).

---

## Dependencies & execution order

- **Phase 1 (T001–T002)** → **Phase 2 (T003–T008, the port)** blocks everything.
- **US1 (Phase 3)** depends on the port; it is the MVP and the first independently shippable increment. Read-side wiring (T016–T018) + dogfood (T020) must land together.
- **US2/US3/US4/US5** each depend on US1's `setup.ts`/`scaffold.ts` existing, but are otherwise independent of each other — their RED test files are distinct, so the four RED tasks (T022, T024, T026, T028) are mutually `[P]`.
- **Polish (Phase 8)** last.

### Parallel opportunities

- Setup: T001 ‖ T002.
- Foundational RED: T003 ‖ T004 ‖ T005 (then impl T006/T007/T008, each after its RED; T008 depends on T007's `Installation` shape).
- US1 RED: T009 ‖ T010.
- Cross-story RED (after US1 lands): T022 ‖ T024 ‖ T026 ‖ T028.
- Polish: T030 ‖ T031 ‖ T032.

## Implementation strategy

- **MVP = US1** (Phase 1 → 2 → 3). Delivers fresh setup + auto-on-first-use + verbs-resolve-through-config + the dogfood. Independently demoable.
- Then layer US2 (safety), US3 (configurability), US4 (monorepo), US5 (verify hardening) — each a small, independently-testable increment behind the same port.
- Commit RED then GREEN per task pair; push at task boundaries (Principle VII).
