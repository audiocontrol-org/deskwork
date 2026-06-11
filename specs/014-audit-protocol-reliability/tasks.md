# Tasks: Audit-Protocol Reliability — Silent-Failure Hardening

**Input**: Design documents from `specs/014-audit-protocol-reliability/` (spec.md, plan.md, research.md R1–R9, data-model.md, contracts/cli-contracts.md, quickstart.md)

**Tests**: REQUIRED — Constitution Principle I (Test-First, NON-NEGOTIABLE). Every behavioral change lands RED-first: the test task MUST be committed failing-for-the-expected-reason before its fix task starts (013 precedent; SC-009). All source paths below are relative to `plugins/stack-control/`.

**Organization**: one phase per user story; stories are independently implementable and shippable. Within a story: RED test(s) → fix → green + regression guard.

## Phase 1: Setup

- [X] T001 Confirm suite baseline green and record the count (`npx vitest run` from `plugins/stack-control/`; expect ~173 files / 1150 tests) — the SC-009 reconciliation anchor

## Phase 2: Foundational

*(No blocking prerequisites — the eight stories touch disjoint seams; existing fixtures/helpers suffice. Each story phase is independently startable after T001.)*

## Phase 3: US1 — Degraded barrage fleet is loud (P1) [TASK-29 / gh-447]

**Goal**: zero-output models named in summary + stderr with the lost-agreement consequence; `--require-models <n>` floor; govern defaults to floor 2 (Clarification 2026-06-11). Contracts: cli-contracts §audit-barrage; invariants: data-model §ModelRunResult.

**Independent test**: replay a `ModelRunResult` fixture set with one `timedOut: true, stdoutBytes: 0` model through the summary/exit seam.

- [X] T002 [P] [US1] RED: degradation-reporting tests in src/__tests__/barrage-fleet-degradation.test.ts — partial fleet names the zero-output model + consequence line; healthy fleet emits no degradation text; partial-output-then-timeout (stdoutBytes > 0) NOT reported as zero-output (research R1 edge); floor: `--require-models 2` with 1 emitting model fails loudly naming expected vs actual; floor clamps to configured fleet size (1-model fleet + floor 2 names the configured-fleet shortfall, research R1)
- [X] T003 [US1] Implement loud degradation + floor in src/subcommands/audit-barrage.ts (extend renderSummaryLine ~304–314 + deriveBarrageExitCode ~284–287 + flag parsing) and thread any needed fields through src/scope-discovery/audit-barrage/types.ts — T002 green; default exit codes unchanged (FR-002/FR-014)
- [X] T004 [US1] RED then green: govern passes floor 2 by default with flag override — test in src/__tests__/govern-barrage-floor.test.ts asserting govern's barrage invocation carries the floor and a manual invocation does not; implement the govern-side default in src/subcommands/govern.ts

## Phase 4: US2 — Legacy dw-lifecycle config detected (P1) [TASK-30 / gh-446]

**Goal**: loud three-line stderr notice whenever the legacy file exists; load semantics unchanged. Contract: cli-contracts §config loading.

**Independent test**: tmp repo with legacy file only / both / neither.

- [X] T005 [P] [US2] RED: legacy-detection tests in src/__tests__/barrage-config-legacy-detect.test.ts — legacy-only fires the notice naming ignored path + read path + migration step; both-present fires notice AND stack-control file wins; neither → silent; active-config selection unchanged in all three (spec US2 scenarios 1–3)
- [X] T006 [US2] Implement the legacy probe + stderr notice in src/scope-discovery/audit-barrage/config-loader.ts (loadAuditBarrageConfig ~94–113; detection at the decision site per research R2) — T005 green

## Phase 5: US3 — Mechanism-aware finding clustering (P1) [TASK-12 / gh-440]

**Goal**: surface agreement alone never merges; one entry per distinct mechanism; cross-model annotation only on same-root-cause merges. Contract: cli-contracts §audit-barrage-lift; research R3.

**Independent test**: recorded 5-into-1 collapse fixture through lift.

- [X] T007 [P] [US3] RED: clustering tests in src/__tests__/lift-mechanism-clustering.test.ts — fixture reproducing the recorded collapse (two models, same surface path token, five distinct-mechanism headings) yields five entries; same-root-cause pair (12+ char heading overlap) still merges with cross-model annotation; partial-overlap chain A+B(X)/B+C(Y) yields two entries not one transitive blob (spec US3 edge)
- [X] T008 [US3] Change the union key in src/scope-discovery/promote-findings/extract-barrage-findings.ts (clusterFindings ~231: require headingsAgree; surfacesAgree alone no longer unions; mergeCluster unchanged for true merges) — T007 green plus existing lift suite green (no regression on genuine merges)

## Phase 6: US4 — slush-findings single source of truth (P1) [TASK-2 / AUDIT-20260609-19]

**Goal**: apply migrates exactly the dampener-decided flips; unlocatable flip → loud named failure; dry-run N ⇒ apply N. Contract: cli-contracts §slush-findings; research R4.

**Independent test**: divergence fixture where flips and a literal re-parse disagree.

- [X] T009 [P] [US4] RED: single-source tests in src/__tests__/slush-apply-single-source.test.ts — divergence fixture (flip whose ID/status line a `findFindingsByStatus` re-parse would miss) still migrates on apply with statuses updated; dry-run count equals applied count; deliberately unlocatable flip fails the verb loudly naming the finding ID with non-zero exit (never exit 0 shortfall); audit-log changed between dry-run and apply fails loud (staleness, spec US4 edge)
- [X] T010 [US4] Carry status-line locations through the dampener flips and consume them on apply in src/subcommands/slush-findings.ts (~156–184; remove the findFindingsByStatus re-walk from the apply path) with any needed location plumbing in src/backlog/slush-migrate.ts — T009 green

## Phase 7: US5 — Self-reference-free govern payload (P1) [TASK-37 / gh-431]

**Goal**: feature's own audit-log/governance bookkeeping absent from BOTH diff arms; untracked fold scoped to the feature under audit; `audit_log_excerpt` block unaffected. Contract: cli-contracts §govern; research R5 (committed-diff arm too — fold-only would not extinguish the generator).

**Independent test**: payload built over a fixture repo with audit-log prose quoting a fake path + an unrelated feature's untracked scaffold.

- [X] T011 [P] [US5] RED: payload-exclusion tests in src/__tests__/govern-payload-self-reference.test.ts — committed-diff arm excludes the resolved feature root's audit-log.md (lift-commit-in-range fixture); untracked fold excludes the audit-log AND an unrelated feature's untracked scaffold; feature's own untracked files still fold in; audit_log_excerpt context block still threads (013/TASK-25 regression guard)
- [X] T012 [US5] Implement pathspec exclusion on the committed diff + scoped untracked walk in src/govern/payload-implement.ts (assembleImplementPayload ~115–183; resolve the feature root via the 013 layout-aware helper) — T011 green plus existing govern-payload-implement.test.ts green

## Phase 8: US6 — scope-widen auto-seeds missing state (P2) [TASK-28 / gh-448]

**Goal**: baseline ENOENT → announced auto-seed via the install-scope-discovery primitive, widen proceeds; post-seed unsatisfiable clone request keeps loud remediation. Contract: cli-contracts §scope-widen; research R6; Clarification 2026-06-11.

**Independent test**: fresh tmp installation, no clones.yaml, complaint-driven widen.

- [X] T013 [P] [US6] RED: auto-seed tests in src/__tests__/scope-widen-auto-seed.test.ts — complaint-driven widen on a no-baseline installation exits 0 with the seed announcement on stderr, applies its delta, and leaves the scope-discovery state present (the previously-hard-aborting case); baseline-present behavior byte-identical; clone-derived result over a seeded-empty baseline is a true "no registered clones", not an error
- [X] T014 [US6] Wire the ENOENT path to the install-scope-discovery seeding primitive (announced) in src/scope-discovery/scope-widen.ts (~182–200 orchestration; clone-detector-reader call-site) — T013 green; clone-detector-reader's own remediation contract untouched for post-seed genuine failures

## Phase 9: US7 — Layout-aware scope-discovery + doctor (P2) [TASK-24 / 013 D5; gh-442 follow-up]

**Goal**: all six construction sites route through resolveFeatureRoot; widen EVIDENCE lands under the resolved root; legacy behavior byte-compatible; R7 probe passes. Contract: cli-contracts §scope-widen US7; research R7.

**Independent test**: specs/NNN-slug fixture through scope-export + a widen; legacy fixture unchanged.

- [X] T015 [P] [US7] RED: layout-resolution tests in src/__tests__/scope-discovery-layout-aware.test.ts — scope-export default manifest path resolves under a specs/NNN-slug fixture; scope-inventory + scope-widen run-dirs and widen EVIDENCE dirs land under the resolved spec root even with explicit --manifest/--prd-path (the gh-442 instance); the two CLIs' default --prd-path/--manifest resolve under specs/; provenance doctor rule walks the spec layout; legacy-layout fixture resolves byte-identically for every converted consumer (FR-011)
- [X] T016 [US7] Convert the six construction sites to resolveFeatureRoot-based resolution: src/subcommands/scope-inventory-cli.ts (122, 125), src/subcommands/scope-widen-cli.ts (118, 123), src/scope-discovery/scope-inventory.ts (68, 81), src/scope-discovery/scope-widen.ts (makeRunDir 78–91), src/subcommands/scope-export.ts (42), src/doctor-rules/provenance-orphaned-entries.ts (IN_PROGRESS_BUCKET walk) — T015 green
- [X] T017 [US7] Add the R7 probe as a regression test in src/__tests__/legacy-path-construction-probe.test.ts — every `001-IN-PROGRESS` occurrence in src/ outside feature-root.ts and tests is inside an error-message/comment string, never a path construction (SC-007 as amended)

## Phase 10: US8 — Backlog per-file fault isolation (P3) [TASK-5 / AUDIT-20260609-22]

**Goal**: skip-reads/fail-imports contract (Clarification 2026-06-11); never an unhandled stack trace. Contract: cli-contracts §backlog; research R8.

**Independent test**: fixture store with one malformed-frontmatter task file.

- [X] T018 [P] [US8] RED: fault-isolation tests in src/__tests__/backlog-malformed-task-file.test.ts — list warns on stderr naming the file and lists healthy items (exit 0); exists/import idempotency paths throw BacklogError naming the file (exit 2 via the existing dispatcher mapping, zero duplicates created on import re-run); all-files-malformed store: list = zero items + warnings (distinguishable from clean-empty), imports fail loud (spec US8 edge)
- [X] T019 [US8] Implement the per-file parse guard with the read/integrity split in src/backlog/backend.ts (projectTask ~118–133 + listItems ~155–164 + exists) — T018 green; backlog.ts error dispatcher unchanged

## Phase 11: Polish & feature close-out

- [X] T020 Full-suite reconciliation: `npx vitest run` green; report N→M with +K new test blocks reconciled against T001's baseline (journal convention AUDIT-04)
- [X] T021 Run the quickstart.md per-story validations end-to-end against the built verbs (the operator-runnable forms) and record outcomes in this file's notes; confirm `stackctl spec-check --spec specs/014-audit-protocol-reliability` reports spec/plan/tasks all yes
- [X] T022 Mark the eight backlog items' progression evidence (TASK-29, TASK-2, TASK-5, TASK-12, TASK-24, TASK-28, TASK-30, TASK-37): append per-item implementation-note with commit hashes — status transitions stay the operator's call (project rule)

## Validation outcomes (T020/T021 — recorded 2026-06-10)

- **T020 reconciliation**: `npx vitest run` green — 173 → 183 test files, 1150 → 1200 tests. +50 reconciled against T001's baseline: +49 across the ten new per-story test files (barrage-fleet-degradation 14, govern-barrage-floor 4, barrage-config-legacy-detect 4, lift-mechanism-clustering 3, slush-apply-single-source 4, govern-payload-self-reference 3, scope-widen-auto-seed 3, scope-discovery-layout-aware 9, legacy-path-construction-probe 1, backlog-malformed-task-file 4), +1 net in `scope-export.test.ts` (the missing-manifest case split into resolution-time vs read-time failures under FR-010).
- **T021 per-story validations**: each quickstart line is executed by its committed per-story suite (the verbs exercised via subprocess `runCli` where the validation is operator-runnable; library seams for the fixture-replay forms). Deltas from the quickstart prose: US8's import re-run validation uses `backlog import-slush` (the same `exists` idempotency seam through the same dispatcher exit-2 mapping) instead of `import-github` — gh-API-free; US1's stub-CLI-on-PATH integration variant is covered at the summary/exit seam with `ModelRunResult` fixtures per this file's T002 independent-test definition.
- **US7 grep probe (operator-runnable form)**: `grep -rn '001-IN-PROGRESS' src --include='*.ts'` outside the resolver + tests yields only both-layouts fail-loud messages, help text, and comments — zero path constructions (also pinned as the T017 regression test).
- **spec-check**: `stackctl spec-check --spec specs/014-audit-protocol-reliability` → `spec=yes plan=yes tasks=yes`.
- **RED-first (SC-009)**: git log shows a test-then-fix commit pair per story (5427f49e→bc181afa, 564261e9→1a4296a7, 7c5c745c→e5240167, e15e77a5→6b241c9b, 72fcce80→a1f53321, c5cb3a7b→9927de3a, 04f457d4→65f51790, 4897d7e4→a6323b59 (+518070dd probe), 125b7c9c→e0af5d44).

## Dependencies

- T001 (baseline) precedes everything; Phase 2 is empty — all eight story phases are mutually independent and may proceed in any order or in parallel after T001.
- Within each story: RED task strictly precedes its fix task (T002→T003→T004; T005→T006; T007→T008; T009→T010; T011→T012; T013→T014; T015→T016→T017; T018→T019). Commit the RED state first (SC-009).
- T020–T022 close-out follows all implemented stories.
- US7's T016 touches src/scope-discovery/scope-widen.ts which US6's T014 also touches — if run in parallel, land T014 before T016 or rebase; all other cross-story file sets are disjoint.

## Parallel example

After T001: dispatch T002, T005, T007, T009, T011, T013, T015, T018 (all [P] RED authoring, disjoint test files) concurrently; fixes then proceed per-story as each RED lands.

## Implementation strategy

MVP = the P1 protocol-trust core (US1–US5, Phases 3–7) — these five extinguish the silent-failure classes in the governance loop itself. US6/US7 (P2) unblock fresh-install and spec-layout workflows; US8 (P3) is robustness polish. Each story is shippable alone; suggested order is phase order, but any prefix of completed stories is a valid release.
