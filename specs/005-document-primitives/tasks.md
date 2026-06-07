---
description: "Task list for design/document-primitives implementation"
---

# Tasks: Generalized document-handling primitives — archive & curate (`design/document-primitives`)

**Input**: Design documents from `specs/005-document-primitives/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED and REQUIRED — Constitution Principle I (Test-First, NON-NEGOTIABLE). Every behavioral task is preceded by a RED test (Vitest), verified failing for the right reason before implementation.

**Organization**: by user story (US1/US2/US3 from spec.md). The shared engine is Foundational (blocks all stories). The two proof documents (FR-013) and the cross-cutting gates (FR-011) are their own phases.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: parallelizable (different files, no incomplete-task dependency).
- **[Story]**: US1/US2/US3 (Setup / Foundational / proof-docs / Polish carry no story label).
- Paths are under `plugins/stack-control/` (succession rule: new capability in the successor).

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create feature dirs: `plugins/stack-control/src/document-model/`, `plugins/stack-control/grammars/`, `plugins/stack-control/skills/{archive,unarchive,curate}/`, `plugins/stack-control/tests/document-primitives/fixtures/`.
- [ ] T002 Add runtime deps `peggy` + `markdown-it` (and `@types/markdown-it`) to the `plugins/stack-control` package manifest (research.md decision).
- [ ] T003 [P] Author fixture documents in `plugins/stack-control/tests/document-primitives/fixtures/`: a governable doc, an ungovernable doc (no grammar), a parse-failing doc, and one with an ordinal-looking identifier.
- [ ] T004 [P] RED: write `scripts/check-no-predecessor-refs.sh` (FR-011 anti-coupling gate — scope globs over the product mechanism (engine/verbs/`skills/**` (all three: archive/unarchive/curate)/grammars/fixtures) + case-insensitive match pattern + exclusions for `specs/`, design docs, and the two proof documents `ROADMAP.md`/`DESIGN-INBOX.md` per spec) plus a Vitest wrapper in `plugins/stack-control/tests/document-primitives/anti-coupling.test.ts` asserting it FAILS on a planted predecessor reference in the mechanism and PASSES when absent (and that a predecessor reference inside a proof document does NOT fail the gate). Must FAIL initially.

---

## Phase 2: Foundational (the shared engine — BLOCKS all user stories)

**⚠️ CRITICAL**: archive, unarchive, and curate all depend on this layer.

- [ ] T005 Define core types in `plugins/stack-control/src/document-model/types.ts`: `Unit`, `GovernableDocument`, `GrammarSpec`, `LedgerEntry`, `ReconciliationHook`, `ArchiveResult`, `CurateReport` (data-model.md).
- [ ] T006 [P] RED: block-stream round-trip test in `plugins/stack-control/tests/document-primitives/block-stream.test.ts` (research risk #1) — a Unit's normalized span maps back to the EXACT original markdown line range across loose/tight lists, fenced code with blank lines, setext headings, tables, HTML blocks. Must FAIL.
- [ ] T007 Implement `plugins/stack-control/src/document-model/block-stream.ts` (markdown-it `md.parse` → normalized one-token-per-line representation + parallel normalized-line→`[startLine,endLine]` map; FR-002). Makes T006 green.
- [ ] T008 [P] RED: grammar-resolver test in `.../grammar-resolver.test.ts` — embedded wins over frontmatter ref; ref resolves project-override → built-in; neither → fail loud (FR-001/FR-012). Must FAIL.
- [ ] T009 Implement `plugins/stack-control/src/document-model/grammar-resolver.ts` (FR-001/FR-012). Makes T008 green.
- [ ] T010 [P] RED: grammar-parse test in `.../grammar-parse.test.ts` — parse a fixture doc against a fixture grammar → typed Units (identifier/status/orderKey/span); malformed grammar AND parse failure → located fail-loud error (research risk #3, FR-003/FR-010). Must FAIL.
- [ ] T011 Implement `plugins/stack-control/src/document-model/grammar-parse.ts` (`peggy.generate` + parse + span back-map via T007's line map). Makes T010 green.
- [ ] T012 [P] RED: identifier-validator test in `.../identifier-validator.test.ts` — uniqueness (case-sensitive) across document ∪ archive; non-ordinal CLOSED denylist (bare-int, `F<n>`, `phase-<n>`, `step-<n>`, `#<n>`, leading `<n>`); no-opaque-token; order-key never references identifier (FR-005/FR-004). Must FAIL.
- [ ] T013 Implement `plugins/stack-control/src/document-model/identifier-validator.ts` (FR-005). Makes T012 green.
- [ ] T014 [P] Author the two built-in grammars `plugins/stack-control/grammars/roadmap.peg` and `plugins/stack-control/grammars/design-inbox.peg` with their full status vocabularies (FR-013) — used as the REAL test grammars (integration-first, Principle II).

**Checkpoint**: the engine resolves grammars, parses to Units with correct spans, and validates identifiers.

---

## Phase 3: User Story 1 — Keep a live document lean by archiving settled items (Priority: P1) 🎯 MVP

**Goal**: move terminal-status Units into a sibling archive (ledger in the archive file) and reverse it.

**Independent Test**: quickstart Scenarios 1 + 2 — archive shipped rows out, confirm zero archivable Units remain and the round-trip restores content (SC-001, SC-007).

### Tests for User Story 1 (RED first) ⚠️

- [ ] T015 [P] [US1] RED: archive dry-run test in `.../archive-engine.test.ts` — selects terminal-status Units, reports planned moves, ZERO writes (FR-009). Must FAIL.
- [ ] T016 [P] [US1] RED: archive `--apply` test — Units cut by span → appended to `<doc>-archive.md`; ledger written IN the archive file; coherence holds; live doc has zero archivable Units and zero bookkeeping (FR-006, SC-001). Must FAIL.
- [ ] T017 [P] [US1] RED: archive atomicity test — a simulated mid-`--apply` write failure leaves NOTHING written (FR-006/FR-010 absolute zero-writes). Must FAIL.
- [ ] T018 [P] [US1] RED: unarchive test in `.../unarchive-engine.test.ts` — restores a named Unit, removes its ledger entry, round-trip restores content; identity collision → fail loud (FR-007). Must FAIL.

### Implementation for User Story 1

- [ ] T019 [US1] Implement `plugins/stack-control/src/document-model/archive-engine.ts` (select → cut by span → append → ledger → coherence; atomic write). Makes T015–T017 green.
- [ ] T020 [US1] Implement `plugins/stack-control/src/document-model/unarchive-engine.ts` (FR-007 reversal + collision guard). Makes T018 green.
- [ ] T021 [US1] Implement verb `plugins/stack-control/src/subcommands/archive.ts` (`--doc`, `--apply`; dry-run default; exit codes) per `contracts/archive.md`.
- [ ] T022 [US1] Implement verb `plugins/stack-control/src/subcommands/unarchive.ts` (`--doc`, `--id`, `--apply`) per `contracts/unarchive.md`.
- [ ] T023 [US1] Register `archive` + `unarchive` in the `stackctl` dispatcher.
- [ ] T024 [P] [US1] Author skill `plugins/stack-control/skills/archive/SKILL.md` (thin: dry-run → confirm → apply).
- [ ] T043 [P] [US1] Author skill `plugins/stack-control/skills/unarchive/SKILL.md` (thin: dry-run → confirm → apply) — the P1 reversibility half (FR-007/US1 Scenario 3/SC-007); a first-class `/stack-control:*` skill parallel to archive, wrapping the `unarchive` verb (T022).

**Checkpoint**: archive/unarchive MVP works end-to-end against a real grammar.

---

## Phase 4: User Story 2 — Curate a live document so it stays correct (Priority: P2)

**Goal**: ensure well-formed + well-ordered + properly-archived; recognize the up-to-date seam.

**Independent Test**: quickstart Scenario 3 — curate reports disorder + un-archived terminal Units; `--apply` reorders and archives; identities unchanged (SC-002).

### Tests for User Story 2 (RED first) ⚠️

- [ ] T025 [P] [US2] RED: curate well-formed test in `.../curate-engine.test.ts` — parse failure / identifier violation fails loud with offending span; no partial fix (FR-003). Must FAIL.
- [ ] T026 [P] [US2] RED: curate well-ordered test — reports disorder; `--apply` reorders to declared order key WITHOUT changing any identity (FR-004/FR-005, SC-002). Must FAIL.
- [ ] T027 [P] [US2] RED: curate properly-archived test — flags terminal-status Units still live; `--apply` composes `archive` (FR-006/FR-008). Must FAIL.
- [ ] T028 [P] [US2] RED: curate up-to-date seam test — a declared reconciliation hook is reported "declared, not yet executed" and NEVER run; absent hook is silent; other checks still run (FR-008). Must FAIL.

### Implementation for User Story 2

- [ ] T029 [US2] Implement `plugins/stack-control/src/document-model/curate-engine.ts` (composes `archive-engine`; FR-008). Makes T025–T028 green.
- [ ] T030 [US2] Implement verb `plugins/stack-control/src/subcommands/curate.ts` per `contracts/curate.md` + register in the dispatcher.
- [ ] T031 [P] [US2] Author skill `plugins/stack-control/skills/curate/SKILL.md` (thin: dry-run → confirm → apply).

**Checkpoint**: US1 + US2 both work.

---

## Phase 5: User Story 3 — Identities stay meaningful as items move (Priority: P3)

**Goal**: the engine rejects ordinal/misleading identifiers and identity is stable across reorder + archive/unarchive.

**Independent Test**: quickstart Scenario 4.3 + SC-004 — an ordinal identifier is rejected; identifiers unchanged across reorder and round-trip.

### Tests for User Story 3 (RED first) ⚠️

- [ ] T032 [P] [US3] RED: ordinal-rejection end-to-end test in `.../identifier-invariants.test.ts` — a doc whose grammar admits `F3` / bare-int / `phase-2` fails loud at the verb boundary naming the identifier (FR-005). Must FAIL until T034.
- [ ] T033 [P] [US3] RED: identity-stability test — identifiers byte-for-byte unchanged across a curate reorder AND an archive→unarchive round-trip (SC-004). Must FAIL until T034.

### Implementation for User Story 3

- [ ] T034 [US3] Wire `identifier-validator` (T013) into the archive/unarchive/curate verb paths so violations fail loud end-to-end (FR-005/FR-010). Makes T032–T033 green.

**Checkpoint**: identifier invariants enforced at every verb boundary.

---

## Phase 6: Proof documents & generality (FR-013 / SC-005)

- [ ] T035 [P] Establish `plugins/stack-control/DESIGN-INBOX.md` by lifting the current project design-inbox content (declares the design-inbox grammar; **lossless** migration over **content bodies** — every existing entry's body preserved; a nonconforming identifier MAY be normalized to satisfy FR-005, recording the rename; the result must pass `curate`).
- [ ] T036 [P] Establish `plugins/stack-control/ROADMAP.md` (new plugin-local roadmap; declares the roadmap grammar; `<phase>/<slug>` rows).
- [ ] T037 RED→green: generality integration test in `.../generality.test.ts` — BOTH proof documents are governed by the SAME engine code path, differing only in grammar (SC-005).
- [ ] T038 RED→green: lossless-migration test — every pre-existing inbox entry's **body** appears in `DESIGN-INBOX.md` with no content dropped; any normalized identifier has its rename recorded; the migrated document passes `curate` (FR-013 lossless-over-content-bodies).

**Checkpoint**: one engine, two real document shapes, no content lost.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T039 Run `scripts/check-no-predecessor-refs.sh` over the product mechanism (engine/verbs/`skills/**` (all three: archive/unarchive/curate)/grammars/fixtures; proof documents excluded) → **zero** predecessor references; the gate is green (FR-011/SC-006). Makes T004 fully green.
- [ ] T040 [P] Verify Principle VI: every new file < 500 lines; refactor any that exceed it.
- [ ] T041 [P] Author `plugins/stack-control` README/usage docs for `archive` + `curate` (no rot-prone version strings — link the releases page).
- [ ] T042 Run all six `quickstart.md` scenarios end-to-end against the two proof documents.

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2, the engine)** → user stories. No story work begins until T005–T014 are done.
- **US1 (P3 phase)** is the MVP. **US2** depends on US1 (curate composes `archive`). **US3** depends on US1 (stability test needs the round-trip).
- **Phase 6** depends on the verbs (US1/US2) + both grammars (T014).
- **Polish (P7)** last; T039 (anti-coupling green) is release-blocking.

### Within each story

- RED tests precede implementation (Principle I); verify each fails for the right reason first.
- Engine modules: T005 (types) precedes all; T007 (block-stream) precedes T011 (parse); T013 (validator) precedes T034 (wiring).
- `curate-engine` (T029) depends on `archive-engine` (T019).

### Parallel opportunities

- T003 ∥ T004 (setup).
- RED tests across modules/stories are `[P]` (distinct files): T006, T008, T010, T012; T015–T018; T025–T028; T032–T033.
- T014 (grammars) ∥ engine implementation.
- T024 ∥ T043 (US1 archive + unarchive skills, distinct files).
- T035 ∥ T036 (proof docs); T040 ∥ T041 (polish).

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Setup → Foundational (engine) → US1 (archive/unarchive).
2. **STOP & VALIDATE**: quickstart Scenarios 1 + 2 — a real document's settled rows archive out and round-trip back (SC-001, SC-007). Demo.

### Incremental delivery

US1 (archive MVP) → US2 (curate) → US3 (invariants enforced end-to-end) → Phase 6 (two proof documents prove generality) → Polish (anti-coupling gate green, quickstart end-to-end). Each increment is independently testable.

## Notes

- `[P]` = different files, no incomplete-task dependency.
- Reimplement the archive mechanism **fresh** — zero predecessor-plugin references in the shipped surface (FR-011); the anti-coupling gate (T004/T039) enforces this.
- Implementation (`/speckit-implement`) runs in a dedicated implementation session per the project's orchestrator/implementer split.
- This feature's own `after_implement` governance (the cross-model audit-barrage) fires when these tasks are implemented.
