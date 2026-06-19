---
doc-grammar: tasks
---

# Tasks: Roadmap edge-mutation and cluster (discoverability-first)

**Feature**: specs/027-roadmap-edge-mutation-and-cluster · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Tests are REQUIRED (Constitution Principle I — Test-First, NON-NEGOTIABLE): each story's tests are written RED before its implementation. Paths are relative to `plugins/stack-control/`. `[P]` = parallelizable (distinct files, no incomplete-task dependency).

## Phase 1 — Setup

- [X] T001 Add `commander` (and `@types/node`-compatible types if needed) to `package.json` deps; `npm install`; confirm ESM import resolves under `tsx`.
- [X] T002 [P] Create the typed parser-adapter scaffold `src/cli-help/command-adapter.ts` (a thin typed wrapper turning a commander `Command` + parsed opts into a per-verb typed options object — the no-`as`/no-`any` boundary, research Decision 1).

## Phase 2 — Foundational (blocking prerequisites for US1 + US2)

- [X] T003 RED test `tests/cli/parser-adapter.test.ts`: the typed adapter yields a fully-typed options object for a sample command with zero `as`/`any` (CHK024); asserts unknown-flag and unknown-subaction error shapes + exit codes (contract §exit codes).
- [X] T004 Mount `roadmap` as a commander `Command` in `src/cli.ts`, delegating every un-migrated verb to the existing flat `SUBCOMMANDS` path unchanged (FR-006 non-regression).
- [X] T005 RED test `tests/roadmap/non-regression.test.ts`: every existing roadmap subaction (`next/blocked/order/graph/add/advance/decompose/reclassify/defer/reconcile/close-related`) keeps its current behavior + flags after mounting (FR-006, CHK022).

## Phase 3 — User Story 1: self-documenting roadmap (P1) 🎯 MVP

**Goal**: a fresh agent learns the full roadmap surface from `--help`/usage alone, no probing.
**Independent test**: quickstart Scenario 1 — `roadmap --help`, `roadmap`, `roadmap <sub> --help` each print the real surface; flags shown == flags accepted.

- [X] T006 [P] [US1] RED test `tests/roadmap/help-nondrift.test.ts`: for every roadmap subaction, the flags enumerated in `--help` are exactly the flags the parser accepts (no shown-but-unparsed / parsed-but-unshown) (FR-005, CHK015).
- [X] T007 [P] [US1] RED test `tests/roadmap/help-surface.test.ts`: `roadmap --help` lists every subaction + summary (exit 0); `roadmap` (no subaction) prints the COMPLETE subaction set (exit 2); `roadmap advance --help` surfaces the status vocabulary (FR-002/003/004, CHK013/014).
- [X] T008 [US1] Express each existing roadmap subaction as a commander sub-command definition (name, summary, options, value vocabularies incl. the status set) in `src/subcommands/roadmap.ts` — the single source rendering help AND driving parse (FR-001/004, data-model VerbCommandDefinition).
- [X] T009 [US1] Wire `--help`/`-h`/no-subaction usage through the adapter so all of T006/T007 pass GREEN; confirm zero `as`/`any` at the boundary (CHK024).

**Checkpoint**: US1 independently testable — quickstart Scenario 1 passes.

## Phase 4 — User Story 2: cluster existing items in one move (P2)

**Goal**: group N existing items under a (created-or-reused) parent + optional dependency chain, atomically, no hand-edit.
**Independent test**: quickstart Scenarios 2–4.

- [ ] T010 [P] [US2] RED test `tests/roadmap/cluster.test.ts`: create-new parent + `--chain` wires `part-of` on each child and `depends-on` `a→b→c`; reuse existing parent (no duplicate); multi-parent child gains the edge alongside an existing different-parent `part-of` (FR-008/009/010, CHK001/007/008/020).
- [ ] T011 [P] [US2] RED test `tests/roadmap/cluster-refusal.test.ts`: missing child / empty `--children` / `parent==child` / cycle / conflicting-`depends-on`-under-`--chain` each refuse (exit 2) and leave `ROADMAP.md` byte-for-byte unchanged; dry-run default writes nothing (FR-011/012/013/014/015, CHK002/003/004/009/011).
- [ ] T012 [US2] Confirm the atomicity-reuse assumption against `src/roadmap/mutations.ts` (build→revalidate→write; `reclassify` multi-edge precedent) — record finding; if absent, STOP and surface (research Decision 2, CHK027).
- [ ] T013 [US2] If the projection collapses multi-`part-of`, widen `WorkItem.partOf` to `string[]` in `src/roadmap/roadmap-model.ts` and adjust readers (data-model note, CHK028); else record that it already supports it.
- [ ] T014 [US2] Implement `cluster(parentId, children, {chain, summary, apply})` in `src/roadmap/mutations.ts` composing `add`/`setField`/`rewriteEdgeLine` inside one build→revalidate→write (FR-007..015). Split `mutations.ts` into per-mutation modules if it exceeds the 500-line cap (CHK025).
- [ ] T015 [US2] Add the `cluster` (+ `group` alias) commander sub-command definition + handler in `src/subcommands/roadmap.ts` (dry-run default, `--apply`, `--children`, `--chain`, `--summary`); surfaced in `--help` via the same definition.

**Checkpoint**: US2 independently testable — quickstart Scenarios 2–4 pass; US1 still green.

## Phase 5 — User Story 3: honest governed header (P3)

**Goal**: the `ROADMAP.md` header never traps the agent between "do not hand-edit" and "no verb exists."
**Independent test**: quickstart Scenario 5.

- [ ] T016 [P] [US3] RED test `tests/roadmap/honest-header.test.ts`: the rendered header names the mutation verbs, includes a worked `cluster` example, and states the hand-edit-then-`roadmap order` fallback (FR-016, CHK023).
- [ ] T017 [US3] Rewrite the `ROADMAP.md` header (and the `curate`/header-emitting code path if the header is generated) to the honest-interim form; make T016 GREEN.

## Phase 6 — Polish & cross-cutting

- [ ] T018 [P] Record the TWO deferred sibling roadmap items (FR-017): a capability item (edge-mutation verb set, absorbs TASK-137) and a surface-hygiene item (verb-surface consolidation rollout), each `ref`-linked back from this feature (FR-018). Use `stackctl roadmap add` (or `cluster`, dogfooding).
- [ ] T019 [P] Verify `src/roadmap/mutations.ts` and `src/subcommands/roadmap.ts` are within the 300–500-line cap; refactor if over (CHK025, Principle VI).
- [ ] T020 Run the full quickstart (Scenarios 1–6) against a fixture roadmap; confirm all pass and the real `ROADMAP.md` is untouched.
- [ ] T021 Per-phase governance: run `stackctl govern --mode implement --phase <id>` at each phase boundary (per-phase, not batched — `feedback_govern_per_phase_not_batched`).

## Dependencies & order

- Setup (T001–T002) → Foundational (T003–T005) → US1 (T006–T009) → US2 (T010–T015) → US3 (T016–T017) → Polish (T018–T021).
- US2 depends on the parser mount (T004) and the atomicity/projection checks (T012–T013) before T014.
- US3 is independent of US2 (header text) but its honest content assumes the verbs US1/US2 deliver exist.

## Parallel opportunities

- T002 ∥ (within setup). T006 ∥ T007 (US1 tests). T010 ∥ T011 (US2 tests). T016 (US3 test). T018 ∥ T019 (polish).

## MVP scope

**US1 alone** (self-documenting roadmap) is a viable MVP — it removes the cycle-burning friction even before `cluster` lands.
