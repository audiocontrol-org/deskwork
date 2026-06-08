# Tasks: Roadmap protocol

**Feature**: `design:feature/roadmap-protocol` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

TDD is mandatory (Constitution I — NON-NEGOTIABLE): every implementation task is preceded by a RED test task that must be seen failing first. Fixtures live on disk (never mock the FS — `.claude/rules/testing.md`). Paths are relative to repo root. `[P]` = parallelizable (different files, no incomplete dependency).

**Layer legend**: Engine = `plugins/stack-control/src/document-model/`; Grammar = `plugins/stack-control/grammars/`; Roadmap = `plugins/stack-control/src/roadmap/`; Verb = `plugins/stack-control/src/subcommands/roadmap.ts` + `src/cli.ts`.

## Phase 1: Setup

- [ ] T001 [P] Create roadmap test fixtures under `plugins/stack-control/tests/roadmap/fixtures/` — heading-keyed roadmap docs covering: linear chain, diamond, dependency cycle, dangling edge, `deferred-until` set, terminal-status-still-live, duplicate identifier
- [ ] T002 [P] Create the `plugins/stack-control/tests/roadmap/` Vitest suite scaffolding (shared fixture loaders, temp-dir helpers mirroring `tests/document-primitives/`)

## Phase 2: Foundational (BLOCKING — all user stories depend on this)

**Generic edge capability (engine)**

- [ ] T003 Add `EdgeFieldSpec` + `Edge` types and extend `GrammarSpec` (`edgeFields`) + `Unit` (`edges`) in `plugins/stack-control/src/document-model/types.ts` (per contracts/edge-engine-api.md)
- [ ] T004 [P] RED: test `grammar-resolver` parses an `edgeFields` metadata block (and absence ⇒ empty) in `plugins/stack-control/tests/document-primitives/grammar-resolver-edgefields.test.ts`
- [ ] T005 Implement `edgeFields` parsing in `plugins/stack-control/src/document-model/grammar-resolver.ts` (validate `references` ∈ {unit,external,prose}; `acyclic`/`blocking` booleans) — make T004 green
- [ ] T006 [P] RED: test `extractEdges(body, grammar)` parses declared edge-field lines (`- depends-on: a, b`), ignores undeclared fields, fails loud on malformed lines — `tests/document-primitives/edges-extract.test.ts`
- [ ] T007 Implement `extractEdges` in NEW `plugins/stack-control/src/document-model/edges.ts` — make T006 green
- [ ] T008 [P] RED: test `assertReferentialIntegrity` fails loud naming field+source+missing target for a dangling `references:'unit'` edge; passes for sound docs (FR-005) — `tests/document-primitives/edges-integrity.test.ts`
- [ ] T009 Implement `assertReferentialIntegrity` in `edges.ts` — make T008 green
- [ ] T010 [P] RED: test `assertAcyclicAndOrder` returns a topological order for a DAG and fails loud naming the cycle for a cyclic edge-type (FR-006) — `tests/document-primitives/edges-acyclic.test.ts`
- [ ] T011 Implement `assertAcyclicAndOrder` (Kahn's; R3) in `edges.ts` — make T010 green
- [ ] T012 RED: test `loadDocument` populates `Unit.edges` and runs referential integrity on load (a dangling-edge fixture fails loud) — `tests/document-primitives/document-edges-integration.test.ts`
- [ ] T013 Wire `extractEdges` + `assertReferentialIntegrity` into `plugins/stack-control/src/document-model/document.ts` `loadDocument` — make T012 green

**Grammar rewrite (the contract the primitives operate through)**

- [ ] T014 RED: test the heading-keyed roadmap grammar parses a fixture into Units with `<phase>:<kind>/<slug>` identifiers + parsed edges; a non-conforming `## heading` fails loud; `orderValue` = phase — `tests/document-primitives/roadmap-grammar-heading.test.ts`
- [ ] T015 Rewrite `plugins/stack-control/grammars/roadmap.peg` to heading-keyed (level 2) with the `<phase>:<kind>/<slug>` production + `edgeFields` metadata (per contracts/roadmap-grammar.md); preserve the current row-keyed grammar as `plugins/stack-control/grammars/roadmap-legacy.peg` until migration — make T014 green

**Roadmap model (typed graph over the document)**

- [ ] T016 RED: test `roadmap-model` loads a roadmap document into `WorkItem[]` (phase/kind parsed from identifier; dependsOn/partOf/deferredUntil/spec/ref populated) — `tests/roadmap/roadmap-model.test.ts`
- [ ] T017 Implement `plugins/stack-control/src/roadmap/roadmap-model.ts` (compose document-model load + edges) — make T016 green

**Checkpoint**: engine parses heading-keyed roadmaps with integrity-checked edges; `curate`/`archive` still load the new grammar. Foundational complete.

## Phase 3: User Story 1 — Fresh-agent orientation (Priority: P1) 🎯 MVP

**Goal**: a fresh session reads the roadmap and answers next-ready / why-blocked from the document alone.
**Independent test**: quickstart Scenario 1 (SC-001/SC-006).

- [ ] T018 [P] [US1] RED: tests for `ready` + `blockedBy` over chain/diamond/deferred/terminal fixtures (ready iff all deps `shipped`, no `deferred-until`, non-terminal; cancelled/retired dep ⇒ blocked, never satisfied) — `tests/roadmap/graph-ready-blocked.test.ts`
- [ ] T019 [US1] Implement `ready` + `blockedBy` in NEW `plugins/stack-control/src/roadmap/graph.ts` — make T018 green
- [ ] T020 [US1] RED: test the verb emits `roadmap next` (ready-list) and `roadmap blocked` (blockers named); no writes — `tests/roadmap/verb-next-blocked.test.ts`
- [ ] T021 [US1] Implement `roadmap` verb `next`/`blocked` subactions in `plugins/stack-control/src/subcommands/roadmap.ts` and register `roadmap` in `plugins/stack-control/src/cli.ts` — make T020 green
- [ ] T022 [US1] Checkpoint: quickstart Scenario 1 green end-to-end (MVP delivers fresh-agent orientation)

## Phase 4: User Story 2 — Emergent-work capture in one move (Priority: P1)

**Goal**: capture a discovered bug/gap as a peer item with kind+grouping+deps in one command.
**Independent test**: quickstart Scenario 3 (SC-003).

- [ ] T023 [US2] RED: tests for `mutations.add` — one-move add with `--part-of`+`--depends-on`; whole-graph re-validate; dangling target ⇒ zero-write (document hash unchanged) — `tests/roadmap/mutations-add.test.ts`
- [ ] T024 [US2] Implement `add` in NEW `plugins/stack-control/src/roadmap/mutations.ts` (compose load → insert → re-validate → atomic write; zero-write on failure, R7) — make T023 green
- [ ] T025 [US2] RED: test verb `roadmap add <id> --kind-via-id --part-of … --depends-on … --apply` (dry-run default) — `tests/roadmap/verb-add.test.ts`
- [ ] T026 [US2] Implement `add` subaction in the verb — make T025 green
- [ ] T027 [US2] Checkpoint: quickstart Scenario 3 green

## Phase 5: User Story 4 — Query the dependency graph (Priority: P2)

**Goal**: `blocks`, derived `order`, and the mermaid graph view (extends US1's next/blocked).
**Independent test**: quickstart Scenario 1 full (blocks/order/graph) (FR-013/008/014).

- [ ] T028 [P] [US4] RED: tests for `blocks(x)` and derived `order` (topological + phase tiebreak via `ordering.compareUnits`) — `tests/roadmap/graph-blocks-order.test.ts`
- [ ] T029 [US4] Implement `blocks` + `order` in `plugins/stack-control/src/roadmap/graph.ts` — make T028 green
- [ ] T030 [P] [US4] RED: tests for `views` — ready-list/blocked-report formatting + mermaid flowchart from `depends-on` (FR-014/015; derived, never persisted) — `tests/roadmap/views.test.ts`
- [ ] T031 [US4] Implement NEW `plugins/stack-control/src/roadmap/views.ts` — make T030 green
- [ ] T032 [US4] RED: test verb `roadmap blocks <id>` / `order` / `graph` — `tests/roadmap/verb-queries.test.ts`
- [ ] T033 [US4] Implement `blocks`/`order`/`graph` subactions in the verb — make T032 green
- [ ] T034 [US4] Checkpoint: graph queries + mermaid green

## Phase 6: User Story 3 — Mid-build re-decomposition (Priority: P2)

**Goal**: decompose/reclassify/advance/defer as supported, graph-revalidating, zero-write-on-failure mutations.
**Independent test**: quickstart Scenario 4 (FR-009/010/001a).

- [ ] T035 [P] [US3] RED: tests for `mutations.advance` (lifecycle) + `mutations.defer` (set/clear prose `deferred-until`) — `tests/roadmap/mutations-advance-defer.test.ts`
- [ ] T036 [US3] Implement `advance` + `defer` in `mutations.ts` — make T035 green
- [ ] T037 [P] [US3] RED: tests for `mutations.decompose` (split one→N; resolve former dependents; cycle ⇒ zero-write) — `tests/roadmap/mutations-decompose.test.ts`
- [ ] T038 [US3] Implement `decompose` in `mutations.ts` — make T037 green
- [ ] T039 [P] [US3] RED: tests for `mutations.reclassify` (rename identifier + rewrite every referencing edge atomically; zero-write on failure — FR-001a) — `tests/roadmap/mutations-reclassify.test.ts`
- [ ] T040 [US3] Implement `reclassify` in `mutations.ts` — make T039 green
- [ ] T041 [US3] RED: test verb `advance`/`decompose`/`reclassify`/`defer` subactions — `tests/roadmap/verb-mutations.test.ts`
- [ ] T042 [US3] Implement those subactions in the verb — make T041 green
- [ ] T043 [US3] Checkpoint: quickstart Scenario 4 green

## Phase 7: User Story 5 — Reconciliation backstop, report-only (Priority: P3)

**Goal**: report/propose status drift from on-disk artifact progression; never mutate.
**Independent test**: quickstart Scenario 5 (SC-004 / FR-016/016a/016b/017).

- [ ] T044 [US5] RED: tests for `reconcile` — status-drift proposals from artifact-progression at the item's `spec:` path; orphans via the declared glob; unresolved correspondences reported (never guessed); document hash identical before/after (report-only) — `tests/roadmap/reconcile.test.ts`
- [ ] T045 [US5] Implement NEW `plugins/stack-control/src/roadmap/reconcile.ts` (read linked dir: spec/plan/tasks presence + tasks completion + governance-graduation record = shipped; no git/gh) — make T044 green
- [ ] T046 [US5] RED: test verb `roadmap reconcile` is report-only — `tests/roadmap/verb-reconcile.test.ts`
- [ ] T047 [US5] Implement `reconcile` subaction in the verb — make T046 green
- [ ] T048 [US5] Checkpoint: quickstart Scenario 5 green (0 silent mutations)

## Phase 8: User Story 6 — Migrate the prose roadmap (Priority: P2)

**Goal**: the canonical heading-keyed `ROADMAP.md` becomes the single source; the prose roadmap retires to a pointer.
**Independent test**: quickstart Scenario 7 (SC-005 / FR-019/020).

- [ ] T049 [US6] RED: presence test — every real feature from `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md` exists as an item in the migrated `ROADMAP.md`; the graph validates green — `tests/roadmap/migration-presence.test.ts`
- [ ] T050 [US6] Author the heading-keyed canonical `plugins/stack-control/ROADMAP.md` from the prose roadmap (scope + explicit `depends-on` edges derived from prose dependency notes; statuses from current reality) — make T049 green. MUST include: (a) a `design:feature/roadmap-protocol` row for this feature itself (the manual self-seed per Assumptions), and (b) a `design:gap/roadmap-order-gating` item capturing the deferred hard out-of-order gating (FR-018) so the deferral is a captured roadmap item, never silently dropped
- [ ] T051 [US6] Retire `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md` to a pointer at the canonical roadmap; capture any bug/gap found during migration as `fix`/`gap` items (FR-020)
- [ ] T052 [US6] Remove the legacy `plugins/stack-control/grammars/roadmap-legacy.peg` once migration is green (no remaining row-keyed roadmap)
- [ ] T053 [US6] Checkpoint: quickstart Scenario 7 green (one canonical roadmap)

## Phase 9: Polish & Cross-Cutting

- [ ] T054 [P] Author `plugins/stack-control/skills/roadmap/SKILL.md` — the `/stack-control:roadmap` discipline + verb usage; dry-run-first; enforcement lives here + the verb (never a git hook)
- [ ] T055 [P] Regression test: `curate`/`archive` operate unchanged on the heading-keyed roadmap (quickstart Scenario 6) — `tests/roadmap/curate-archive-regression.test.ts`
- [ ] T056 File-size audit: every new module ≤ 500 lines (Constitution VI); `tsc` strict clean across the plugin; no `any`/`as`/`@ts-ignore`
- [ ] T057 Full quickstart run-through; session-end clone-snapshot (no new duplication); ready for `after_implement` governance barrage

## Dependencies & execution order

- **Setup (P1–2)** → **Foundational (P2)** blocks everything.
- Within Foundational: T003 → {T004/5, T006/7→T008/9→T010/11} → T012/13; grammar T014/15 needs the edge types (T003); model T016/17 needs grammar + edges.
- **US1 (P3)** is the MVP and only needs Foundational. **US2 (P4)** needs `roadmap-model` + `mutations.ts` (new). **US4 (P5)** extends `graph.ts`. **US3 (P6)** extends `mutations.ts`. **US5 (P7)** is independent (new `reconcile.ts`). **US6 (P8)** needs the grammar + verb to exist (so after US1).
- Mutation tasks within `mutations.ts` (T024/T036/T038/T040) touch one file → sequential, not `[P]`. Their RED tests are `[P]`.
- Polish last.

## Parallel opportunities

- Setup: T001 ∥ T002.
- Foundational RED tests: T004 ∥ T006 (then their impls serialize through `edges.ts`); T008/T010 are `[P]` RED.
- US4: T028 ∥ T030 (different files: graph.ts vs views.ts) RED.
- US3: T035 ∥ T037 ∥ T039 RED (then impls serialize in `mutations.ts`).
- Polish: T054 ∥ T055.

## MVP scope

**Foundational + User Story 1** (through T022): a parsed, integrity-checked, heading-keyed roadmap plus `roadmap next`/`roadmap blocked` — a fresh agent can determine the next ready item and why something is blocked, from the document alone. Everything after is incremental (capture → richer queries → mutations → reconcile → migration).

## Implementation strategy

Deliver MVP (US1) first and verify Scenario 1. Then layer US2 (capture) and US4 (queries) — both high-value, low-risk. US3 (mutations) is the largest single-file effort (`mutations.ts`); keep it under cap. US5 (reconcile) is independent and advisory. US6 (migration) is the dogfood that will surface `fix`/`gap` items — do it after the verb is solid so captured bugs land cleanly. Governance fires at `/speckit-implement`.
