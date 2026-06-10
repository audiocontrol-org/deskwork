---
description: "Task list — Migrate scope-discovery into stack-control"
---

# Tasks: Migrate scope-discovery into stack-control (`design/migrate-scope-discovery`)

**Input**: Design documents from `specs/010-migrate-scope-discovery/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R6), data-model.md, contracts/cli-verbs.md, quickstart.md

**Tests**: REQUIRED — Constitution Principle I (Test-First) is NON-NEGOTIABLE. Every port lands as RED (failing behavior test pinning the generalized contract) → GREEN (port-and-generalize). No untested verbatim copy.

**Delivery**: FULL SURFACE, ONE DELIVERY (operator decision — no partial). User-story priorities (P1→P3) are internal build order, not separate ship increments. Nothing is "done" until US1–US8 + Polish all land.

**Boundary**: Migrate only the IN-SCOPE set (spec § "Migration boundary — explicitly out of scope"). Do NOT touch dw-lifecycle (isolation invariant / SC-010). Do NOT re-migrate audit-barrage/promote-findings(partial)/util(partial). Do NOT pull in the audit-orchestration loop.

## Format: `[ID] [P?] [Story] Description with file path`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[USn]**: the user story this serves (story phases only)
- Paths are repo-relative; source under `plugins/stack-control/src/scope-discovery/`, tests under `plugins/stack-control/src/__tests__/scope-discovery/`, verbs in `plugins/stack-control/src/subcommands/`, skills under `plugins/stack-control/skills/`.

---

## Phase 1: Setup (shared infrastructure)

- [X] T001 Add `jscpd` ^4, `ajv` ^8, `ajv-formats` ^3 to `plugins/stack-control/package.json` dependencies (R2); run `npm install` and confirm the workspace resolves.
- [X] T002 [P] Create the `plugins/stack-control/src/scope-discovery/{discovery-agents,discovery-agents/pattern-handlers,doctor-rules,schema,util}/` directory skeleton per plan § Project Structure.
- [X] T003 [P] Create the test root `plugins/stack-control/src/__tests__/scope-discovery/` with a shared tmp-fixture helper (two-installation fixture builder) used by integration tests.

---

## Phase 2: Foundational (blocking prerequisites — MUST precede all user stories)

**Purpose**: the per-codebase boundary resolver, jscpd wrapper, clones.yaml parse/serialize, schema validation, and the not-yet-migrated `util/*` — everything downstream depends on these.

- [X] T004 [P] RED: `__tests__/scope-discovery/codebase-boundary.test.ts` — boundary resolves to nearest-enclosing `.stack-control` installation, excludes nested child subtrees, and FAILS LOUD (no cwd fallback) when no config is found (FR-007; data-model § CodebaseBoundary).
- [X] T005 GREEN: implement `scope-discovery/codebase-boundary.ts` reusing 009 `src/config/resolve-paths.ts` walk-up; derive `excludedChildren`; no `process.cwd()` default → T004 GREEN.
- [X] T006 [P] RED: `__tests__/scope-discovery/jscpd-runner.test.ts` — runner invokes jscpd scoped to a given root + ignore-list, parses the JSON report, surfaces engine crashes as exit-2 errors.
- [X] T007 GREEN: port `scope-discovery/jscpd-runner.ts` from dw-lifecycle, parameterized by boundary root + ignore (no repo-root assumption) → T006 GREEN.
- [X] T008 [P] RED: `__tests__/scope-discovery/clones-yaml.test.ts` — parse/serialize round-trip, stable content-hashed ids, malformed file fails loud (FR-035).
- [X] T009 GREEN: port `scope-discovery/clones-yaml.ts` + `clones-yaml.parse.ts` + `clones-yaml.id.ts` → T008 GREEN.
- [X] T010 [P] RED: `__tests__/scope-discovery/manifest-validator.test.ts` — ajv validates a good manifest/registry, rejects schema violations naming the offense.
- [X] T011 GREEN: port the JSON schemas into `scope-discovery/schema/*.schema.json` + `schema/manifest-validator.ts` (ajv + ajv-formats) → T010 GREEN.
- [X] T012 [P] RED: `__tests__/scope-discovery/util.test.ts` — covers the not-yet-migrated helpers (registry-yaml load, glob, modules, git-ancestry, audit-log-parser, catalog-status).
- [X] T013 GREEN: port `scope-discovery/util/{registry-yaml,glob,modules,git-ancestry,audit-log-parser,catalog-status}.ts` (reuse already-present `atomic-write-file`, `feature-root`, `typeguards`) → T012 GREEN.

**Checkpoint**: boundary + jscpd + clones parsing + schema validation + util ready; all user stories unblocked.

---

## Phase 3: User Story 1 — Per-codebase clone detection (Priority: P1) 🎯 founding boundary proof

**Goal**: `stackctl check-clones` finds duplication scoped to the codebase by default, never cross-codebase. **Independent test**: quickstart Scenario 1 (two-codebase fixture; cross-codebase exclusion; vendored audit-barrage not flagged).

- [X] T014 [P] [US1] RED: `__tests__/scope-discovery/check-clones.percodebase.test.ts` — two-installation fixture with a cross-codebase duplicate + an intra-A duplicate: default run from A reports intra-A only, zero A↔B matches; explicit `--root` honored (FR-005/006/008; SC-001).
- [X] T015 [P] [US1] RED: `__tests__/scope-discovery/check-clones.vendored.test.ts` — the audit-barrage vendored from dw-lifecycle into stack-control is NOT reported as a clone (SC-002).
- [X] T016 [US1] GREEN: port `scope-discovery/clone-detector.ts` with the boundary default = resolved installation root (T005), nested children added to jscpd ignore; retain `--root`/`--baseline`/`--gate-mode`/`--diff`/`--json`/`--quiet` flags → T014/T015 GREEN.
- [X] T017 [US1] Add `check-clones` subcommand `src/subcommands/check-clones.ts` (flag validation, exit-code convention per contracts) and register it in `src/cli.ts`.
- [X] T018 [P] [US1] Author `/stack-control:check-clones` skill at `skills/check-clones/SKILL.md` (thin adapter over the verb).
- [X] T019 [US1] Integration: `__tests__/scope-discovery/check-clones.integration.test.ts` drives quickstart Scenario 1 end-to-end against the tmp fixture.

**Checkpoint**: per-codebase clone detection works by default and is the proven boundary the rest builds on.

---

## Phase 4: User Story 2 — Disposition & maintain the baseline (Priority: P1)

**Goal**: disposition clone groups, gate NEW vs baseline, Step 0 refactor preconditions, refresh carries dispositions. **Independent test**: quickstart Scenario 2.

- [X] T020 [P] [US2] RED: `__tests__/scope-discovery/dispose-clone.test.ts` — keep/ignore dispositions write + persist; `refactor` REFUSED without Step 0a (canonical-side) + Step 0b (tests-proof) (FR-011; SC-005).
- [X] T021 [P] [US2] RED: `__tests__/scope-discovery/new-gating.test.ts` — gate-mode surfaces a NEW intra-codebase clone (exit 1); dispositioned groups don't re-trip (FR-012; SC-006).
- [X] T022 [P] [US2] RED: `__tests__/scope-discovery/refresh-baseline.test.ts` — refresh carries forward curated dispositions across a pure file rename (FR-013).
- [X] T023 [US2] GREEN: port `scope-discovery/clones-yaml.refactor.ts` (Step 0a/0b fields + validation) → T020 GREEN.
- [X] T024 [US2] GREEN: port `scope-discovery/dispose-clone.ts` + `check-refactor-preconditions.ts` + `check-refactor-preconditions.runtime.ts` + `refactor-preconditions-prompt.ts` → T020 GREEN.
- [X] T025 [US2] GREEN: port `scope-discovery/refresh-clones-baseline.ts` + `check-disposition-survivor.ts` → T021/T022 GREEN.
- [X] T026 [US2] GREEN: port `scope-discovery/batch-dispose.ts` SPLIT to ≤500 lines (extract apply/render helper per R4) → bulk-disposition test GREEN (FR-014).
- [X] T027 [US2] Add subcommands `dispose-clone`, `batch-dispose`, `refresh-clones-baseline`, `check-disposition-survivor`, `check-refactor-preconditions` in `src/subcommands/` + register in `src/cli.ts`.
- [X] T028 [P] [US2] Author the matching `/stack-control:*` skills under `skills/`.
- [X] T029 [US2] Integration: drive quickstart Scenario 2 end-to-end.

**Checkpoint**: the full vendored detector (baseline + dispositions + NEW-gating + Step 0) replaces the `clone-snapshot.sh` stopgap.

---

## Phase 5: User Story 3 — Upfront discovery & widening (Priority: P2)

**Goal**: `scope-inventory` fans the agents → schema-valid manifest; `scope-widen` surfaces missed siblings; green ≠ all-clear. **Independent test**: quickstart Scenario 3.

- [ ] T030 [P] [US3] RED: `__tests__/scope-discovery/synthesis.test.ts` — synthesis folds agent outputs into a schema-valid manifest; novel-shape candidates surfaced, NOT reported all-clear (FR-017).
- [ ] T031 [P] [US3] RED: `__tests__/scope-discovery/discovery-agents.test.ts` — the four universal agents produce expected surfaces over a fixture; route-enumerator default is override-able (FR-018).
- [ ] T032 [P] [US3] RED: `__tests__/scope-discovery/scope-widen.test.ts` — widen surfaces a sibling absent from the prior manifest, reconciled (FR-016).
- [ ] T033 [US3] GREEN: port `discovery-agents/{ui-route-enumerator,pattern-matrix,prd-themed-pattern-hunter,prd-relevance,clone-detector-reader,shared,types,synthesis-discovered-candidates}.ts` + `pattern-handlers/*` → T031 GREEN.
- [ ] T034 [US3] GREEN: port `discovery-agents/codebase-state-metrics*.ts` SPLIT to ≤500 lines (extract gather/types per R4) → agent test GREEN.
- [ ] T035 [US3] GREEN: port `synthesis*.ts` (synthesis, -cli, -derive, -derive-regime, -error-hints, -report, -types, -warnings) → T030 GREEN.
- [ ] T036 [US3] GREEN: port `scope-inventory.ts` SPLIT to ≤500 (extract fan-out/evidence helper per R4) + `scope-inventory-cli.ts` → inventory test GREEN (FR-015).
- [ ] T037 [US3] GREEN: port `scope-widen.ts` + `scope-widen-cli.ts` + `scope-widen-delta.ts` → T032 GREEN.
- [ ] T038 [US3] Add subcommands `scope-inventory`, `scope-widen` + register in `src/cli.ts`; author the two `/stack-control:*` skills.
- [ ] T039 [US3] Integration: drive quickstart Scenario 3 end-to-end.

---

## Phase 6: User Story 4 — Registry-driven checks (config-activated) (Priority: P2)

**Goal**: anti-patterns / adopters / module-symmetry / deprecations; config-activated agents no-op on empty registries. **Independent test**: quickstart Scenario 4.

- [ ] T040 [P] [US4] RED: `__tests__/scope-discovery/check-anti-patterns.test.ts` — empty registry no-ops; seeded glob/regex/ast-grep/ts-morph entry + matching file surfaces holdout at declared severity (FR-019/020; SC-008).
- [ ] T041 [P] [US4] RED: `__tests__/scope-discovery/check-adopters.test.ts` — non-importing file in an adopter glob flagged; exceptions/holdouts honored (FR-021).
- [ ] T042 [P] [US4] RED: `__tests__/scope-discovery/symmetry-deprecations.test.ts` — module-symmetry matrix + deprecation+importers reports (FR-022/023).
- [ ] T043 [US4] GREEN: port `anti-patterns-registry.ts` + `anti-patterns-report.ts` + `check-anti-patterns.ts` (+ the anti-patterns schema) → T040 GREEN.
- [ ] T044 [US4] GREEN: port `adopter-manifests-registry.ts` + `adopter-manifests-report.ts` + `check-adopters.ts` + `discovery-agents/adopter-manifest-checker.ts` (+ adopter-manifests + migration-map schemas) → T041 GREEN.
- [ ] T045 [US4] GREEN: port `discovery-agents/regime-holdout-detector.ts` (activates only when registries non-empty) → config-activated no-op test GREEN.
- [ ] T046 [US4] GREEN: port `module-symmetry-matrix.ts` + `module-symmetry-report.ts` + `check-module-symmetry.ts` with `check-editor-symmetry` deprecation alias → T042 GREEN (FR-022).
- [ ] T047 [US4] GREEN: port `deprecation-scan.ts` + `deprecation-report.ts` + `check-deprecations.ts` → T042 GREEN (FR-023).
- [ ] T048 [US4] Add subcommands `check-anti-patterns`, `check-adopters`, `check-module-symmetry`, `check-deprecations` + register in `src/cli.ts`; author the `/stack-control:*` skills.
- [ ] T049 [US4] Integration: drive quickstart Scenario 4 end-to-end.

---

## Phase 7: User Story 5 — Dispatch wrapper + gutted-stub validators (Priority: P2)

**Goal**: enforce Searched/Included/Excluded grammar + forbidden-deferral rejection; harness fails on a gutted gate. **Independent test**: quickstart Scenario 5.

- [X] T050 [P] [US5] RED: `__tests__/scope-discovery/dispatch-wrapper.test.ts` — reject missing-enumeration when searched>included; reject forbidden-deferral phrase; refactor-marked task gets the preconditions prelude (FR-024/025).
- [X] T051 [P] [US5] RED: `__tests__/scope-discovery/gutted-stub.test.ts` — the validator harness FAILS against a deliberately gutted gate stub (FR-026; SC-007).
- [X] T052 [US5] GREEN: port `dispatch-grammar.ts` + `dispatch-wrapper.ts` + `dispatch-wrapper-overrides.ts` (project-overridable forbidden-phrase list) → T050 GREEN.
- [X] T053 [US5] GREEN: port `dispatch-wrapper-cli.ts` + `validate-scope-discovery.ts` (the adversarial harnesses incl. gutted-stub self-check) → T051 GREEN.
- [X] T054 [US5] Add subcommands `dispatch-wrapper`, `validate-scope-discovery` + register in `src/cli.ts`; author the `/stack-control:*` skills.
- [X] T055 [US5] Integration: drive quickstart Scenario 5 end-to-end.

---

## Phase 8: User Story 6 — Install / customize / doctor / summary / export (Priority: P2)

**Goal**: public install into `.stack-control/scope-discovery/`, override seam, summary/export, doctor rules. **Independent test**: quickstart Scenario 6.

- [ ] T056 [P] [US6] RED: `__tests__/scope-discovery/install-scope-discovery.test.ts` — creates empty-but-valid registries + schemas + `config.yaml` under `.stack-control/scope-discovery/`; idempotent + non-destructive (FR-027; SC-003/004).
- [ ] T057 [P] [US6] RED: `__tests__/scope-discovery/sd-config-loader.test.ts` — loads/validates `.stack-control/scope-discovery/config.yaml` (own schemaVersion), fail-loud on unknown keys (R5).
- [ ] T058 [P] [US6] RED: `__tests__/scope-discovery/doctor-rules.test.ts` — flags schema-violating registry / refactor-incomplete / override-drift; mutates only with `--fix` (FR-031).
- [ ] T059 [P] [US6] RED: `__tests__/scope-discovery/customize.test.ts` — runtime resolves a project override over the plugin default (FR-029).
- [ ] T060 [US6] GREEN: implement `scope-discovery/sd-config.ts` (scope-discovery config loader, mirrors stack-control config-loader idiom) → T057 GREEN.
- [ ] T061 [US6] GREEN: port `install-scope-discovery.ts` MINUS the hook-install machinery (OQ-6) → T056 GREEN.
- [ ] T062 [US6] GREEN: port the scope-discovery-relevant `doctor-rules/*` + `doctor-rules/index.ts` + the override-resolver path for `customize` → T058/T059 GREEN.
- [ ] T063 [US6] GREEN: port `scope-export.ts` + `summary.ts` → export/summary tests GREEN (FR-030).
- [ ] T064 [US6] Add subcommands `install-scope-discovery`, `customize` (scope-discovery category), `scope-summary`, `scope-export`, and the scope-discovery `doctor` rules wiring + register in `src/cli.ts`; author the `/stack-control:*` skills.
- [ ] T065 [US6] Integration: drive quickstart Scenario 6 end-to-end.
- [ ] T080 [P] [US6] RED: `__tests__/scope-discovery/cross-installation-isolation.test.ts` — a `dispose-clone`/`refresh-clones-baseline` (and a registry write) in installation A leaves a sibling installation B's baseline + registries byte-for-byte unchanged (SC-004 clause b; spec § "Edge Cases" concurrent installations). GREEN is satisfied by the boundary-scoped writes from T005/T016/T024/T025 — this task fails first if any write escapes its installation. (Analyze remediation V1.)

---

## Phase 9: User Story 7 — Governance implement-mode clone step (Priority: P3)

**Goal**: `govern --mode implement` runs the per-codebase clone step; TODO placeholder gone. **Independent test**: quickstart Scenario 7.

- [X] T066 [P] [US7] RED: `__tests__/scope-discovery/govern-clone-step.test.ts` — implement-mode govern over a diff with a NEW intra-codebase clone surfaces it; no TODO remains (FR-032; SC-011).
- [X] T067 [US7] GREEN: wire the clone-detection step into `src/subcommands/govern.ts` + `src/govern/protocol.ts` (replace the TODO), calling the per-codebase `check-clones` from Phase 3 → T066 GREEN.
- [X] T068 [US7] Integration: drive quickstart Scenario 7 end-to-end.

---

## Phase 10: User Story 8 — Install-drift advisory (Priority: P3)

**Goal**: warn on stale locally-sourced `.specify` extension copies (advisory, non-blocking). **Independent test**: quickstart Scenario 8.

- [X] T069 [P] [US8] RED: `__tests__/scope-discovery/install-drift.test.ts` — drifted extension copy warns naming it; in-sync copy silent (FR-033; R6).
- [X] T070 [US8] GREEN: implement `scope-discovery/install-drift.ts` (re-derive manifest hash / content diff vs plugin source) + `src/subcommands/install-drift.ts` + register in `src/cli.ts` → T069 GREEN.
- [X] T071 [US8] Author `/stack-control:install-drift` skill; integration drives quickstart Scenario 8.

---

## Phase 11: Polish & cross-cutting

- [ ] T072 [P] SC-010 verification: run `dw-lifecycle`'s own scope-discovery tests + a `check-clones` in its tree; assert its baseline/config are byte-for-byte unchanged (quickstart Scenario 9).
- [ ] T073 [P] SC-009 verification: run every migrated verb in a plain shell with no Claude Code surface (quickstart Scenario 10).
- [ ] T074 [P] `tsc` strict + lint clean (no `any`/`as`/`@ts-ignore`); confirm every new source file ≤500 lines (Principle VI; R4 splits landed).
- [ ] T075 [P] FR-004 ledger: record per-component whether it ported verbatim/generalized or rebuilt native, in `specs/010-migrate-scope-discovery/port-ledger.md`.
- [ ] T076 [P] Update `plugins/stack-control/README.md` + the new SKILL.md files documenting the scope-discovery verbs, the per-codebase-default behavior, and the `.stack-control/scope-discovery/` config contract.
- [ ] T077 Promote the "Captured for future expansion" items (v2 agents, cross-language, studio surface, cross-repo rollup, Agent-intercept) to first-class roadmap/backlog entries (operator tracking requirement; spec § "Captured for future expansion").
- [ ] T078 Reconcile `design:gap/project-relative-doc-discovery` subsumption (CHK033) — confirm no duplicate config-resolution; record the decision for `roadmap reconcile`.
- [ ] T079 Note the retirement of the interim `.dw-lifecycle/scope-discovery/clone-snapshot.sh` stopgap now that the full per-codebase detector ships (do not delete dw-lifecycle's; document that stack-control no longer needs the snapshot path).
- [ ] T081 [P] RED: `__tests__/scope-discovery/subcommand-flag-validation.test.ts` — every migrated subcommand rejects an unknown/malformed flag with a fail-loud error (contracts § "each subcommand validates its own flags — no flag silently ignored"); covers the CLI-surface invariant the integration tests exercise only indirectly. (Analyze remediation V2.)

---

## Dependencies & execution order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** blocks everything. The boundary resolver (T004/T005) is the spine of the new behavior.
- **US1 (Phase 3)** is the founding boundary proof — first, MVP-critical, and the dependency for US7's govern wiring (T067 calls Phase 3's check-clones).
- **US2 (Phase 4)** depends on US1's clone-detector + Foundational clones-yaml.
- **US3/US4/US5/US6 (Phases 5–8)** each depend on Foundational; their RED files are distinct → the four RED clusters (T030–T032, T040–T042, T050–T051, T056–T059) are mutually `[P]`. US4's regime-holdout agent depends on US3's synthesis (T045 after T035).
- **US7 (Phase 9)** depends on US1. **US8 (Phase 10)** is independent of the detector internals.
- **Polish (Phase 11)** last; T072 (dw-lifecycle-untouched) and T074 (cap/typing) gate "done."
- **Remediation tasks (from /speckit-analyze):** T080 (SC-004 cross-installation isolation) sits in US6 and `[P]` with the other US6 REDs; T081 (subcommand flag-validation) is cross-cutting in Polish and `[P]`. Total tasks: 81.

### Parallel opportunities

- Setup: T002 ‖ T003.
- Foundational RED: T004 ‖ T006 ‖ T008 ‖ T010 ‖ T012 (each GREEN follows its own RED).
- Per-story RED clusters are `[P]` across stories once Foundational lands.
- Skills authoring (T018, T028, …) parallel with their story's integration test.

## Implementation strategy

- **One delivery, no phasing** (operator decision): US1–US8 + Polish all land before the feature is complete. Priorities order the *build*, not the ship.
- **Build order = de-risk first**: Foundational boundary (Phase 2) → US1 (prove per-codebase scoping end-to-end) → US2 (make the detector usable) → US3–US6 (discovery/registries/dispatch/install) → US7–US8 (govern + session wiring) → Polish.
- **TDD per task pair**: RED (failing behavior test) before GREEN (port-and-generalize). Commit RED then GREEN; push at task boundaries (Principle VII).
- **Isolation**: never edit dw-lifecycle; verify SC-010 in Polish (T072).
