# Tasks: Low-friction insight capture

**Feature**: `specs/007-insight-capture` | **Branch**: `feature/stack-control`
**Inputs**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/inbox-cli.md](./contracts/inbox-cli.md) · [quickstart.md](./quickstart.md)

**TDD is mandatory (Constitution Principle I)** — every implementation task is preceded by a RED test seen failing for the expected reason. All paths are under `plugins/stack-control/`.

**Conventions**: `[P]` = parallelizable (different file, no incomplete dep). `[USn]` = user-story phase task. Mutations mirror `src/roadmap/mutations.ts`; verb mirrors `src/subcommands/roadmap.ts`; tests mirror `tests/roadmap/*` (tmp-copied fixtures + `runCli` via `spawnSync`).

## Phase 1: Setup

- [X] T001 [P] Create `plugins/stack-control/tests/inbox/fixtures/sample-inbox.md` — a committed, valid governed design-inbox fixture (frontmatter `doc-grammar: design-inbox`; a few `captured` entries + at least one terminal entry) for mutation/verb tests
- [X] T002 [P] Create `plugins/stack-control/tests/inbox/helpers.ts` mirroring `tests/roadmap/helpers.ts` (FIXTURES path, `INBOX_OPTS` LoadOptions with `builtinGrammarDir`, `tmpCopy(name)` for an isolated tmp copy)

## Phase 2: Foundational (blocks US1 + US2 — shared safety primitive + verb shell)

- [X] T003 RED: `tests/inbox/commit.test.ts` — the shared validate-and-commit helper: a candidate that fails whole-document validation throws `DocumentModelError` and leaves the file byte-for-byte unchanged (zero-write); a valid candidate writes atomically (dry-run writes nothing)
- [X] T004 Implement the shared `commit(docPath, candidate, opts, apply)` helper in `src/inbox/mutations.ts` (mirror `roadmap/mutations.ts:commit` — `loadDocumentFromSource(candidate)` re-validates the whole doc, then `writeFileSync` only on apply; throws before any write on failure). Make T003 green
- [X] T005 RED: `tests/inbox/verb-inbox.test.ts` — the `inbox` verb dispatcher shell: unknown subaction → exit 2; unknown flag → exit 2; missing/ungovernable `--doc` → exit 2 with a descriptive message; `--apply` parsed
- [X] T006 Implement the `inbox` verb dispatcher shell in `src/subcommands/inbox.ts` (subaction routing, `--doc`/`--apply` parsing, unknown-flag rejection à la roadmap `validateFlags`, exit 0/2, catch `DocumentModelError`→exit 2) and register `inbox: runInboxCli` in `src/cli.ts` `SUBCOMMANDS`. Make T005 green
  - **Reorder note:** the read-only `list` subaction (originally T016/T017, US2) was pulled forward into T006 — it is the shell's natural doc-load path, so "ungovernable `--doc` → exit 2" is asserted honestly here rather than via a stub handler (Principle V, no-fallbacks). T016/T017 are satisfied by this commit; their checkboxes are ticked in Phase 4.

**Checkpoint**: engine-backed commit helper + verb shell exist and are green; ready for capture.

## Phase 3: User Story 1 — Safe one-move capture (Priority: P1) 🎯 MVP

**Goal**: capture an idea in one move; add-time whole-document re-validation; zero-write-on-failure.
**Independent test**: quickstart Scenario 1 (SC-001/002/003).

- [X] T007 [US1] RED: `tests/inbox/mutations-capture.test.ts` — `capture()` appends a `captured` entry and the doc still validates; duplicate identifier → throws + zero write; empty/whitespace idea → throws; dry-run writes nothing; **capturing leaves pre-existing entries byte-identical (FR-006 — multiple threads held at once, one capture doesn't disturb others)**
- [X] T008 [US1] Implement `capture(docPath, input, opts, apply)` in `src/inbox/mutations.ts` — build a `### <title>` section (status `captured`; optional Surfaced/Context/Idea/Provisional-home body fields; reject empty title/idea) and commit via the T004 helper. Make T007 green
- [X] T009 [US1] RED: capture verb cases in `tests/inbox/verb-inbox.test.ts` (via `runCli`) — `inbox capture "<title>" --idea … --apply` → exit 0 + entry present; missing `<title>` or `--idea` → exit 2; duplicate → exit 2 + zero write; dry-run → exit 0 + unchanged
- [X] T010 [US1] Wire the `capture` subaction into `src/subcommands/inbox.ts` (positional `<title>`; flags `--idea`/`--surfaced`/`--context`/`--home`; dispatch to `capture()`). Make T009 green
- [X] T011 [US1] Checkpoint: ran quickstart Scenario 1 against a scratch copy of the governed inbox — capture (exit 0, entry `captured`), duplicate refusal (exit 2, byte-for-byte unchanged = SC-002), dry-run (exit 0, unchanged). ✅

## Phase 4: User Story 2 — Triage & graduation (Priority: P2)

**Goal**: promote (record target, reuse creators) / drop (record reason); reuse existing curate/archive for lean-keeping.
**Independent test**: quickstart Scenario 2 (SC-005).

- [X] T012 [P] [US2] RED: `tests/inbox/mutations-promote-drop.test.ts` — `promote()` sets status `promoted` + records the target reference; `drop()` sets `dropped` + records the reason; absent entry → throws; already-terminal entry → throws; zero-write on any failure; **`promote` only RECORDS the target reference — it does NOT create or validate the target artifact (FR-014/FR-012, record-and-reuse; the target need not exist in the inbox)**
- [X] T013 [US2] Implement `promote()` + `drop()` in `src/inbox/mutations.ts` (advance-style: rewrite the design-inbox `**Status:**` bullet — note its grammar-specific shape, see research D3 — and append the target/reason body line; commit via T004 helper). Make T012 green
- [X] T014 [US2] RED: promote/drop verb cases in `tests/inbox/verb-inbox.test.ts` — `inbox promote "<title>" --to <ref> --apply` → exit 0; `inbox drop "<title>" --reason … --apply` → exit 0; missing `--to`/`--reason` → exit 2; absent/terminal entry → exit 2 + zero write
- [X] T015 [US2] Wire `promote` + `drop` subactions into `src/subcommands/inbox.ts`. Make T014 green
- [X] T016 [P] [US2] RED: `inbox list` cases in `tests/inbox/verb-inbox.test.ts` — lists each entry id + status, writes nothing; missing/ungovernable inbox → exit 2 *(satisfied in Phase 2 — list pulled forward into T006)*
- [X] T017 [US2] Implement the read-only `list` subaction in `src/subcommands/inbox.ts`. Make T016 green *(done in T006)*
- [X] T018 [US2] Checkpoint: ran quickstart Scenario 2 — promote/drop behave (refusals exit 2 on absent/terminal); lean-keeping via the EXISTING `archive`/`unarchive` against `DESIGN-INBOX.md` works with **no new code** (9 terminal entries → 0 in live inbox; archive sibling created; restore works) — FR-008/SC-005 by reuse. ✅

## Phase 5: User Story 3 — One mechanism, one source of truth (Priority: P3)

**Goal**: retire the interim convention; relocate its discipline to the skill body + verb.
**Independent test**: quickstart Scenario 3 (SC-004).

- [X] T019 [US3] RED: `tests/inbox/retirement.test.ts` — asserts the single-mechanism outcome: `.claude/rules/design-inbox.md` absent, the docs-tree pointer `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/design-inbox.md` absent, and no remaining doc instructs hand-appending to the inbox
- [X] T020 [US3] Author `plugins/stack-control/skills/inbox/SKILL.md` — the capture/promote/drop discipline + verb usage (dry-run-first; capture≠scope; record-not-create) as the NEW home for the discipline the interim rule held (per `.claude/rules/enforcement-lives-in-skills.md`)
- [X] T021 [US3] Removed `.claude/rules/design-inbox.md` and the docs-tree pointer; repointed cross-references (thesis canonical-links, roadmap vision § + row, the governed `DESIGN-INBOX.md` header) to `/stack-control:inbox` + the verb. Historical journal/audit-log/tooling-feedback entries left intact (append-only history). T019 green.
- [X] T022 [US3] Checkpoint: Scenario 3 confirmed — both interim files removed, native `/stack-control:inbox` is the only documented capture path, governed `DESIGN-INBOX.md` is the single source of truth. Full suite 399/399 green (generality.test.ts unaffected per research D6).

## Phase 6: Polish & Cross-Cutting

- [X] T023 [P] File-size + strict-typing audit: every new module ≤ 500 lines (largest: mutations.ts 149, inbox.ts 158, roadmap.ts 298); `tsc --noEmit` strict clean; no `any`/`as`/`@ts-ignore` in new src. ✅
- [X] T024 [P] Documented `stackctl inbox` in the plugin README (4 verb rows + an "Insight capture" section noting it replaces the retired convention; cross-linked the SKILL). ✅
- [X] T025 Full quickstart run-through (all 3 scenarios, end-to-end against scratch copies of the governed inbox) + full `vitest` suite green (**399/399**) + session-end clone-snapshot. **DRY:** the substantive new duplication (the validate-and-commit/unit-locating mutation engine, then the verb flag-scan/require plumbing) was extracted into shared modules (`document-model/mutations-core.ts`, `document-verb-shared.ts`) used by BOTH inbox and roadmap. Two small residual clones JUSTIFIED: the 6-line `validateFlags` (legitimately differs — roadmap validates `--clear`, inbox doesn't; full unification is a verb-framework change beyond 007 scope, same magnitude as the 4 tolerated baseline clones) and the 11-line test-helper mirror (research D8 explicitly prescribes mirroring `tests/roadmap/*`; per-suite fixtures-on-disk is the testing convention). Ready for `after_implement` governance.

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** blocks everything. Within P2: T003→T004 (commit helper), T005→T006 (verb shell); the two pairs are independent of each other.
- **US1 (P3)** needs Foundational only — the MVP.
- **US2 (P4)** needs Foundational (T004 helper) + the verb shell (T006); independent of US1's capture code (extends the same two files, so impl tasks serialize on those files).
- **US3 (P5)** needs US1 shipped (can't retire the hand-append convention until the native capture path works) and is otherwise independent.
- **Polish (P6)** last.

## Parallel Opportunities

- Setup: T001 ∥ T002.
- Foundational RED: T003 ∥ T005.
- US2 RED: T012 ∥ T016 (different concerns), then impls serialize in `mutations.ts` / `inbox.ts`.
- Polish: T023 ∥ T024.
- Note: `src/inbox/mutations.ts` and `src/subcommands/inbox.ts` are each touched by multiple tasks → those implementation tasks are sequential (not `[P]`), even where their RED tests are parallel.

## MVP Scope

**Foundational + User Story 1** (through T011): safe, one-move, fail-safe capture against the governed inbox — replaces the hand-edit convention with a validated mechanism. US2 (triage/graduation) and US3 (retire the interim convention) are incremental.

## Implementation Strategy

Deliver MVP (US1) first and verify quickstart Scenario 1. Then US2 (promote/drop + list; lean-keeping is pure reuse of existing verbs). Then US3 — relocate the discipline into the SKILL body, then delete the interim rule + pointer (order matters: the discipline must have its new home before the old one is removed). Governance fires automatically at `after_implement`. **Per the orchestrator/implementation session split, `/speckit-implement` runs in a separate session.**
