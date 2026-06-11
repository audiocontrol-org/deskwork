# Tasks: Descriptive Naming

**Input**: Design documents from `specs/descriptive-naming/` (spec.md, plan.md — research condensed in plan §Research, decisions D1–D4)

**Tests**: REQUIRED — Constitution Principle I (Test-First, NON-NEGOTIABLE). Every behavioral change lands RED-first; commit the RED state before its fix. All source paths relative to `plugins/stack-control/`.

**Organization**: one phase per user story; US2's slug module (D1) is the shared primitive, so it leads after setup.

## Phase 1: Setup

- [ ] T001 Confirm suite baseline green and record the count (`npx vitest run`) — the reconciliation anchor

## Phase 2: US2 foundation — the slug primitive + backlog surfaces (P1)

- [ ] T002 [US2] RED: slug-derivation tests in src/__tests__/backlog-slug.test.ts — deterministic kebab derivation (case, punctuation, truncation at word boundary); stability under title edits (stored `slug:` label wins); collision capture fails loud listing the colliding item, never appends a counter (FR-003); input resolution order (slug label → unique title derivation → TASK-n alias) with fail-loud ambiguity listing candidates (D1)
- [ ] T003 [US2] Implement src/backlog/slug.ts + capture stamping via the existing labels seam in src/backlog/backend.ts — T002 green
- [ ] T004 [US2] RED: slug-first surface tests — `backlog list`/capture confirmation lead with the slug (TASK-n parenthetical); promote/edit/notes accept slug input; import summaries slug-first (src/__tests__/backlog-slug-surfaces.test.ts)
- [ ] T005 [US2] Implement slug-first output + slug input resolution in src/subcommands/backlog.ts — T004 green; existing backlog suites green
- [ ] T006 [US2] RED then green: slush dispositions slug-first (D2) — `Status: migrated-to-backlog <slug> (TASK-n)` written by src/backlog/slush-migrate.ts; existing slush suites updated only where they pin the old format (say so in the commit); audit-protocol-reliability ref-rewrite branch carries the same format

## Phase 3: US1 — slug-only new specs (P1)

- [ ] T007 [P] [US1] RED: promote-target grammar accepts `specs/<slug>` (and keeps `specs/NNN-<slug>` grandfathered) with unchanged fail-loud shapes, in the existing promote-targets tests (D4)
- [ ] T008 [US1] Implement the D4 grammar in src/backlog/promote-targets.ts — T007 green
- [ ] T009 [US1] Update the define skill body (plugins/stack-control/skills/define/SKILL.md) to state slug-only spec directories (bypass the scaffold's auto-numbering explicitly); add a chain regression test pinning that an unnumbered spec dir passes spec-check/execute-check resolution end-to-end (fixture already exists: the installation-isolation dir shape)

## Phase 4: US3 — agents speak in friendly names (P1)

- [ ] T010 [P] [US3] RED: session-start orientation backlog section leads with slugs (TASK-n parenthetical) — verb-output test on the orientation's backlog lines
- [ ] T011 [US3] Implement the slug-first orientation output; update the skill bodies that narrate items to the operator (backlog, session-start, session-end SKILL.md §discipline: friendly names lead; counters parenthetical only for recorded-history cross-reference) — T010 green (FR-008; enforcement-lives-in-skills)

## Phase 5: US4 — recorded history stays navigable (P2)

- [ ] T012 [P] [US4] RED then green: grandfather tests — numbered spec dirs resolve through every converted consumer; bare `TASK-n` input still resolves as an alias; a fixture ledger with old-format dispositions is byte-identical after the new surfaces run (zero rewrites, FR-004/SC-003)

## Phase 6: Polish & close-out

- [ ] T013 Full-suite reconciliation vs T001 (journal convention AUDIT-04)
- [ ] T014 Quickstart-style validation pass: capture → list → promote → disposition → orientation, reading every surface for zero counter-dereferencing (SC-002/SC-005); record outcomes in this file's notes
- [ ] T015 Record the slug-first naming convention at governance level (FR-007): constitution Additional Constraints amendment citing this spec and the roadmap's `phase:kind/slug` precedent

## Dependencies

- T001 → all. T002/T003 (the slug primitive) block T004–T006 and T010/T011. US1 (T007–T009) and US4 (T012) are independent of each other; T012 runs after the format changes it grandfathers (T006, T008).
- RED strictly precedes fix within each story; commit the RED state first.

## Implementation strategy

US2 is the MVP (the daily surface); US1 and US3 complete the directive's two named families plus the agent voice; US4 pins the no-rewrite guarantee. Each story shippable alone; suggested order is phase order.
