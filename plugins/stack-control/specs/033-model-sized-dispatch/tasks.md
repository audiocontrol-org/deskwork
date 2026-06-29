# Tasks: Model-Sized Dispatch — Declarative Per-Task Model Tiers

**Input**: Design documents from `specs/033-model-sized-dispatch/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)
**Tests**: TDD-first (Constitution Principle I, NON-NEGOTIABLE) — each implementation task is preceded by a RED test that fails for the expected reason.
**Organization**: Phases map to the revised spec's user stories. US1 (declare tier → right-sized model) is the MVP. US2 (fail-loud) and US3 (adopt dispatch discipline) follow.

## Format: `[ID] [P?] [Story?] [tier:?] Description with file path`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[USn]**: the user story the task serves
- **[tier:label]**: dogfoods THIS feature's convention — the recommended default vocabulary (`fast` = mechanical single-file, `balanced` = multi-file integration, `powerful` = design/careful-judgment). Informational here (the feature builds the resolver); demonstrates the on-disk format.
- All paths are installation-relative (`plugins/stack-control/`). Strict typing (no `any`/`as`/`!`/`@ts-ignore`); relative `.js` ESM imports; files under 300–500 lines; no fallbacks outside tests.

## Scope guard (operator decision 2026-06-28 — adopt superpowers' stance)

Do **NOT** build a dependency-DAG scheduler, cycle detector, wave engine, ExecutionGraph/RunReport artifacts, an `execute-graph`/`execute-report` verb, or a generated Workflow driver. Ordering/parallelism is the adopted superpowers stance (controller judgment). Those belong to `impl:feature/execution-engine` (specs/002).

---

## Phase 1: Setup

**Goal**: fixtures + scaffolding for the TDD floor.
**Independent test**: the fixtures load; the test dir is wired into vitest.

- [x] T001 [P] [tier:fast] Create test-fixtures scaffolding: a sample tiered `tasks.md`, a valid `tier_map` config, and an out-of-range/malformed `tier_map` config — under `src/__tests__/execute/fixtures/`
- [x] T002 [P] [tier:fast] Create the `src/execute/` module dir and `src/__tests__/execute/` test dir wired into the existing vitest config

**Checkpoint**: fixtures present; empty test dir runs clean.

---

## Phase 2: Foundational (blocking prerequisites for US1/US2)

**Goal**: the `tier_map` config surface + the accepted-model capability constant exist and are fail-loud. BLOCKS tier resolution.
**Independent test**: config-loader parses a valid `tier_map` and rejects malformed/out-of-range maps; the accepted-model constant is the single source of the host model vocabulary.

- [x] T003 [P] [tier:balanced] RED test: config-loader parses a valid `tier_map` (snake→camel `tierMap`) and surfaces it on `InstallationConfig` — in `src/__tests__/config/tier-map.test.ts` (FR-007, contracts/tier-map-config.md)
- [x] T004 [P] [tier:fast] RED test: config-loader rejects a non-mapping `tier_map`, an empty tier label, a non-string value, and a value outside the accepted-model set — same file (FR-008, Principle V)
- [x] T005 [tier:fast] RED test: accepted-model-set constant contains exactly the Claude Code subagent models and is consulted by validators — in `src/__tests__/execute/accepted-models.test.ts` (research D4)
- [x] T006 [tier:fast] Add `TierMap` type + `tierMap?` to `InstallationConfig` — in `src/config/types.ts` (data-model.md)
- [x] T007 [tier:balanced] Extend `src/config/config-loader.ts`: add `tier_map` to `KNOWN_TOP_LEVEL` + a `parseTierMap` helper (mirror `parsePaths`, fail-loud, model-set check) — makes T003/T004 GREEN
- [x] T008 [tier:fast] Add the accepted-model-set capability constant — in `src/execute/accepted-models.ts` — makes T005 GREEN

**Checkpoint**: `tier_map` loads + validates fail-loud; accepted-model set is the one model-vocabulary source.

---

## Phase 3: US1 — Declare a tier per task; dispatch uses the right-sized model (P1) 🎯 MVP

**Goal**: a valid tiered `tasks.md` + tier map resolves to a per-task `{id, tierLabel, model}` table via `stackctl resolve-tiers`. Closes the MVP.
**Independent test**: `resolve-tiers --spec <fixture>` on a valid plan exits 0 and emits a `TierResolution` whose every task's `model` equals `tier_map[task.tierLabel]` and ∈ the accepted-model set (SC-001, quickstart Scenario 1).

- [x] T009 [P] [US1] [tier:balanced] RED test: `tasks-tier-parser` extracts `id`, `[tier:]` label, `body`, `done` from real `tasks.md` lines; ignores `[P]`/`[USn]`/phase headers; collects parse errors (dup id, missing id/body, empty `[tier:]`) — in `src/__tests__/execute/tasks-tier-parser.test.ts` (data-model.md TieredTask)
- [x] T010 [US1] [tier:balanced] Implement `tasks-tier-parser` — in `src/execute/tasks-tier-parser.ts` — makes T009 GREEN
- [x] T011 [P] [US1] [tier:balanced] RED test: `tier-resolution` resolves a label→model via the map + accepted-model set (happy path), returning `ResolvedModel` — in `src/__tests__/execute/tier-resolution.test.ts` (data-model.md TierResolution)
- [x] T012 [US1] [tier:balanced] Implement `tier-resolution` (pure `resolve(label?, map, accepted) → ResolvedModel | TierError`; collect-all entry point) — in `src/execute/tier-resolution.ts` — makes T011 GREEN
- [x] T013 [P] [US1] [tier:balanced] RED test: `resolve-tiers --spec <fixture>` on a valid plan exits 0, emits `TierResolution` JSON, every `model === tier_map[tierLabel]` (SC-001); strict arg parse rejects unknown flag/positional (exit 2) — in `src/__tests__/execute/resolve-tiers.test.ts` (contracts/resolve-tiers-verb.md)
- [x] T014 [US1] [tier:balanced] Implement the `resolve-tiers` verb (resolve installation+map, read tasks.md, parse, resolve, emit) — in `src/subcommands/resolve-tiers.ts` — makes T013 GREEN
- [x] T015 [US1] [tier:fast] Register `resolve-tiers` in `src/cli.ts` `SUBCOMMANDS` + a `--help` descriptor (keep `check-front-door` green)

**Checkpoint**: MVP — a valid tiered plan resolves end-to-end via the CLI; tiers drive models data-drivenly (SC-003 falls out — change the tag/map, re-run, model changes).

---

## Phase 4: US2 — Missing or unknown tier fails loud before dispatch (P1)

**Goal**: every tier error (no tier, unknown tier, absent map for a tiered task) is named and reported together; no partial resolution; nothing dispatched.
**Independent test**: `resolve-tiers` on a plan with mixed errors exits 1, stderr lists every error, stdout emits no resolution (SC-002, quickstart Scenarios 2–4).

- [x] T016 [P] [US2] [tier:fast] RED test: a no-tier task → `task <id> has no model tier declared`, exit 1, no resolution on stdout — `resolve-tiers.test.ts` (FR-004)
- [x] T017 [P] [US2] [tier:fast] RED test: an unknown-tier task → `task <id> declares unknown tier <label>`, exit 1 (FR-005)
- [x] T018 [P] [US2] [tier:fast] RED test: multiple distinct errors are ALL printed before exit (no first-error abort), zero tasks emitted (FR-006)
- [x] T019 [P] [US2] [tier:fast] RED test: a tiered task with no `tier_map` configured → `no tier_map configured; cannot resolve tier '<label>' for task <id>`, exit 1 (FR-008)
- [x] T020 [US2] [tier:powerful] Implement the collect-all fail-loud paths in `tier-resolution` + `resolve-tiers` (gather every TierError, exit 1, emit no partial) — makes T016–T019 GREEN

**Checkpoint**: the pre-dispatch gate is fully fail-loud and complete-error-set (SC-002).

---

## Phase 5: US3 — Execute adopts the subagent-dispatch discipline (P2)

**Goal**: `/stack-control:execute` dispatches a fresh subagent per task with the explicit resolved model, a durable ledger gives resume safety + tier/model observability, and the feature is self-contained (no superpowers runtime dependency).
**Independent test**: read the rewritten SKILL.md (resolve-tiers-first → explicit-model dispatch → review loop → ledger); the ledger module skips already-complete tasks on resume; a source grep finds no superpowers import (SC-004/005/006, quickstart Scenarios 5–6).

- [x] T021 [P] [US3] [tier:balanced] RED test: execution ledger appends `{id, tierLabel, model, commitRange, reviewClean}` and, on resume, reports already-complete ids so they are not re-dispatched — in `src/__tests__/execute/ledger.test.ts` (FR-010/011, SC-004/005)
- [x] T022 [US3] [tier:balanced] Implement the execution-ledger module, anchored in the installation working-file set (installation-anchor invariant) — in `src/execute/ledger.ts` — makes T021 GREEN
- [x] T023 [P] [US3] [tier:fast] RED test: the feature's source (`src/execute/`, `src/subcommands/resolve-tiers.ts`) contains no `superpowers` import/require (FR-013/SC-006) — in `src/__tests__/execute/self-contained.test.ts`
- [x] T024 [US3] [tier:powerful] Rewrite the dispatch step in `skills/execute/SKILL.md`: (1) run `resolve-tiers` first, STOP on non-zero (surface the full error set, no dispatch); (2) dispatch each task to a fresh subagent with an isolated brief and the EXPLICIT model from the resolution (never an inherited default); (3) adopt the task-review loop + durable ledger; (4) ordering/parallelism = controller judgment (no mechanical scheduler); (5) governance unchanged at end (research D6)
- [x] T025 [US3] [tier:fast] Confirm `stackctl check-front-door` stays exit 0 with `resolve-tiers` surfaced; add to `fronted-operations`/help descriptors if required (028 US4)

**Checkpoint**: execute end-to-end uses declarative per-tier models via the adopted discipline; self-contained.

---

## Phase 6: Polish & Cross-Cutting

**Goal**: docs, dogfood config, and the full validation sweep.
**Independent test**: quickstart scenarios pass; vitest green; cap/typing clean.

- [x] T026 [P] [tier:fast] Document the recommended default `tier_map` (`fast`/`balanced`/`powerful`) and the `[tier:<label>]` convention — in a template config + a note in `.specify/templates/tasks-template.md` Format section (FR-007, research D3). The default vocabulary is **recommended, NOT canonical** — the label set stays operator-open (spec Assumptions / open-question b); the doc presents it as a starting point, not a closed enum.
- [x] T027 [P] [tier:fast] Add a dogfood `tier_map` to the installation `.stack-control/config.yaml` so this very `tasks.md` resolves (optional demonstration)
- [x] T028 [tier:balanced] Run all quickstart Scenarios 1–6 against `./bin/stackctl` (source engine); record results in `specs/033-model-sized-dispatch/quickstart.md` Assumptions if any deviate
- [x] T029 [P] [tier:fast] Verify every new file is under the 300–500-line cap, strict-typed (no `any`/`as`/`!`), relative `.js` imports; run full `npx vitest`

**Checkpoint**: feature complete; all six Success Criteria demonstrably met.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS US1/US2 (tier resolution needs the config surface + accepted-model constant).
- **US1 (Phase 3)**: depends on Foundational. The MVP.
- **US2 (Phase 4)**: depends on US1's modules existing (it adds error-path tests + the collect-all impl over the same `tier-resolution`/`resolve-tiers` surface).
- **US3 (Phase 5)**: depends on US1 (needs `resolve-tiers` to call) — independently testable once US1 lands; US2 not strictly required for US3's ledger/skill work but ships before it in priority order.
- **Polish (Phase 6)**: depends on US1–US3.

### Independent Test Criteria (per story)

- **US1**: `resolve-tiers` on a valid tiered plan emits a correct `{id,tier,model}` table (SC-001/003).
- **US2**: `resolve-tiers` on an error plan exits 1 with the complete named error set, no partial (SC-002).
- **US3**: rewritten SKILL.md + ledger give explicit-model dispatch, resume safety, observability, self-containment (SC-004/005/006).

### Parallel Opportunities

- Phase 1: T001, T002 in parallel.
- Phase 2: the RED tests T003/T004/T005 in parallel; then impl T006/T007/T008 (T007 depends on T006).
- Phase 3: RED tests T009/T011/T013 in parallel; each impl follows its own test.
- Phase 4: T016–T019 (all RED tests on the same verb, different cases) in parallel; T020 implements all.
- Phase 5: T021/T023 RED tests in parallel; T024 (SKILL.md) is the careful `powerful`-tier task.

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That alone delivers declarative right-sized model
resolution via `stackctl resolve-tiers`. US2 hardens it to fail-loud; US3 wires it into the
execute dispatch discipline + resume-safe ledger. Ship incrementally in phase order; each phase
is an independently testable increment.
