# Tasks: Audit-Barrage Reliability Hardening

**Input**: Design documents from `specs/014-audit-barrage-reliability/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D8), data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution Principle I (Test-First) is non-negotiable: every behavior task pairs a RED test task (failing for the expected reason) with its GREEN implementation. The 2026-06-10 spike code is NOT ported; mechanisms it discovered are rebuilt test-first.

**Organization**: by user story (spec.md priorities). All paths are relative to repo root; source lives under `plugins/stack-control/`.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Confirm green baseline: run `npm --workspace @deskwork/plugin-stack-control test` and record the passing count (pre-feature reference for honest test-count deltas)

## Phase 2: Foundational (blocking all user stories)

The terminal-state vocabulary (data-model.md) and config v2 grammar (contracts/barrage-config-schema.md) are shared substrate for every story.

- [X] T002 [P] RED: config v2 validation suite in plugins/stack-control/src/__tests__/scope-discovery/audit-barrage/config-loader-v2.test.ts — required `model` field; `{{model}}` placeholder required in args_template; required `readonly_enforcement` (fragment or `none`); `output_mode`/`liveness_signal` enums; `liveness_window_seconds` required when signal ≠ none; derivation-pair-or-override rule; pre-014 config refused with message naming file + missing fields + template path (FR-001/FR-002/FR-011)
- [X] T003 [P] RED: terminal-state suite in plugins/stack-control/src/__tests__/scope-discovery/audit-barrage/terminal-state.test.ts — `terminalState` union on ModelRunResult; `enforcement`/`liveness`/`timeoutBasis` fields; `isModelRunHealthy`/`isModelRunConverged` require `terminalState === 'completed'` (FR-006)
- [X] T004 GREEN: extend plugins/stack-control/src/scope-discovery/audit-barrage/types.ts per data-model.md (terminalState union, enforcement, liveness, TimeoutBasis; predicate updates) until T003 passes
- [X] T005 GREEN: implement config v2 grammar + fail-loud refusals in plugins/stack-control/src/scope-discovery/audit-barrage/config-loader.ts per contracts/barrage-config-schema.md until T002 passes

**Checkpoint**: foundation ready — user stories can proceed (US1/US2 in parallel; US3/US4 build on their outputs).

## Phase 3: User Story 1 — Barrage spawns cannot mutate the repository (P1)

**Goal**: every spawn is mechanically read-only via the lane's `readonly_enforcement` fragment; `none` lanes run loudly marked.

**Independent test**: hostile write-probe (file create, shell redirect, interpreter write, git commit+push) through the enforced spawn path → zero mutations (SC-002).

- [X] T006 [US1] RED: spawn enforcement suite in plugins/stack-control/src/__tests__/scope-discovery/audit-barrage/spawn-readonly.test.ts — argv assembly injects the lane's `readonly_enforcement` fragment before the prompt placeholder; `none` → result carries `enforcement: 'unenforced'`; fragment lanes carry `enforcement: 'enforced'` (FR-003/FR-004)
- [X] T007 [US1] GREEN: argv assembly + enforcement marking in plugins/stack-control/src/scope-discovery/audit-barrage/spawn-cli.ts until T006 passes
- [ ] T008 [US1] RED then GREEN: fire-time warning for unenforced lanes in plugins/stack-control/src/subcommands/audit-barrage.ts + INDEX per-model `enforcement` field in plugins/stack-control/src/scope-discovery/audit-barrage/run-artifacts.ts (contracts/run-artifacts-contract.md row fields)
- [ ] T009 [US1] Hostile-probe verification (SC-002, live): write plugins/stack-control/scripts/probe-readonly-spawn.sh (scratch-clone probe: Write-tool create, `echo >`, `python3` write, `git commit` + push) and run it against the claude fragment (`--permission-mode plan`) AND the codex fragment (`--sandbox read-only`); record per-lane verdicts in the script header comment. FR-005 check: replay a recorded audit prompt under the claude fragment and confirm the output still lifts (plan-mode framing did not break the report shape)
- [ ] T010 [US1] Update plugins/stack-control/templates/audit-barrage-config.yaml lane `readonly_enforcement` values per T009 verdicts (codex ships `none` if its sandbox fails the probe — never assumed)

**Checkpoint**: US1 independently deliverable — enforced spawns cannot mutate; unenforced lanes are loud.

## Phase 4: User Story 2 — Barrage runs complete instead of silently timing out (P1)

**Goal**: explicit model pin + payload-derived timeout with recorded basis.

**Independent test**: replay the 69 KB calibration prompt under the shipped config → claude lane completes, INDEX records the derivation basis (SC-001).

- [X] T011 [P] [US2] RED: derivation suite in plugins/stack-control/src/__tests__/scope-discovery/audit-barrage/timeout-derivation.test.ts — `max(floor, ceil(secs_per_kb × payload_kb))`; explicit `timeout_seconds` displaces derivation and is recorded `override`; basis record fields per data-model.md TimeoutBasis (FR-002)
- [X] T012 [US2] GREEN: implement plugins/stack-control/src/scope-discovery/audit-barrage/timeout-derivation.ts until T011 passes
- [X] T013 [US2] RED: model-pin wiring suite in plugins/stack-control/src/__tests__/scope-discovery/audit-barrage/spawn-model-pin.test.ts — `{{model}}` substitution in argv; orchestrator threads rendered-prompt byte size into derivation; effective timeout armed from basis (FR-001/FR-002)
- [ ] T014 [US2] GREEN: wire substitution + payload threading + basis arming in plugins/stack-control/src/scope-discovery/audit-barrage/spawn-cli.ts and plugins/stack-control/src/scope-discovery/audit-barrage/orchestrate-barrage.ts; render `timeout basis` row in run-artifacts.ts until T013 passes
- [ ] T015 [US2] Migrate plugins/stack-control/templates/audit-barrage-config.yaml to full v2 for ALL lanes including the disabled gemini entry (opus pin, fable override profile documented in comments, calibration numbers from research D5) and migrate the project override .stack-control/audit-barrage-config.yaml; then run quickstart SC-001 replay and record the result

**Checkpoint**: US2 independently deliverable — the 17-timeout scenario is structurally dead.

## Phase 5: User Story 3 — A degraded fleet is loud, not silent (P2)

**Goal**: terminal states consumed everywhere; configured-vs-produced stated on every surface.

**Independent test**: force one lane of two to time out → degradation visible in INDEX, lift output, and loop status without opening the run dir (SC-003).

- [ ] T016 [US3] RED: INDEX rendering suite (extend plugins/stack-control/src/__tests__/scope-discovery/audit-barrage/run-artifacts.test.ts) — per-model `terminal state`/`liveness` rows; fleet report block when produced < configured; quorum line when produced ≤ 1 (FR-007, contracts/run-artifacts-contract.md)
- [ ] T017 [US3] GREEN: fleet report + state rows in plugins/stack-control/src/scope-discovery/audit-barrage/run-artifacts.ts and orchestrate-barrage.ts until T016 passes
- [ ] T018 [US3] RED: lift consumption suite (extend the audit-barrage-lift tests under plugins/stack-control/src/__tests__/) — a non-completed lane contributes zero findings and is reported with its state; per-lane enforcement state printed UNCONDITIONALLY (FR-004's at-synthesis marking, not only on degradation); `produced` counts converged-eligible lanes only (completed + exit 0 + artifact present); fleet report repeated when degraded; never "clean" from a killed lane (FR-007)
- [ ] T019 [US3] GREEN: terminal-state consumption in plugins/stack-control/src/subcommands/audit-barrage-lift.ts until T018 passes
- [ ] T020 [US3] RED then GREEN: govern convergence-loop fleet status in plugins/stack-control/src/govern/ — round status lines include fleet report; 0-HIGH over a degraded fleet annotated; dampener/models-attempted counters count only `completed` lanes (US3 scenario 3)

**Checkpoint**: US3 independently deliverable — silent degradation impossible.

## Phase 6: User Story 4 — Dead spawns fail fast (P2)

**Goal**: in-process watchdog (audiocontrol heartbeat pattern) kills no-sign-of-life spawns inside the liveness window; stream-result extraction preserves the artifact contract.

**Independent test**: never-emitting fixture child killed within window with `killed-no-liveness`; slow-but-alive fixture child never killed (SC-004/SC-005).

- [X] T021 [P] [US4] RED: watchdog suite in plugins/stack-control/src/__tests__/scope-discovery/audit-barrage/watchdog.test.ts (fake timers + fake children) — staleness > window → SIGTERM/SIGKILL path + `killed-no-liveness`; activity resets staleness; `liveness_signal: none` never arms; kill-vs-close race settles once with `completed` winning on close-first; watchdog disarms when timeout kill begins and vice versa (FR-008, data-model state machine)
- [X] T022 [US4] GREEN: implement plugins/stack-control/src/scope-discovery/audit-barrage/watchdog.ts until T021 passes
- [X] T023 [P] [US4] RED: extractor suite in plugins/stack-control/src/__tests__/scope-discovery/audit-barrage/stream-result-extractor.test.ts — NDJSON lines appended to `<model>.events.ndjson`; terminal `result` event text written byte-for-byte as `<model>.md` at settle; stream ending without a result event leaves `<model>.md` absent (no fabrication, FR-010 / Principle V)
- [X] T024 [US4] GREEN: implement plugins/stack-control/src/scope-discovery/audit-barrage/stream-result-extractor.ts until T023 passes
- [X] T025 [US4] RED then GREEN: wire watchdog + extractor into plugins/stack-control/src/scope-discovery/audit-barrage/spawn-cli.ts selected by `output_mode`/`liveness_signal` config fields (never by binary name — Principle III); integration test with fake children covering all four terminal states end-to-end through orchestrate-barrage.ts
- [ ] T026 [US4] Finalize liveness fields in plugins/stack-control/templates/audit-barrage-config.yaml (claude: stream-json/stdout/60s; codex: text/stderr/60s per research D1) and run quickstart SC-004 + SC-005 fixture validations; record results

**Checkpoint**: US4 independently deliverable — dead spawns die in seconds, slow thinkers run.

## Phase 7: Polish & Cross-Cutting

- [ ] T027 Full quickstart pass: execute every SC-001..006 scenario from specs/014-audit-barrage-reliability/quickstart.md against the final build; record evidence (commands + observed values) in the feature audit-log or a quickstart-results note in the spec dir
- [ ] T028 [P] Adopter-facing docs: document config v2 migration in plugins/stack-control/README.md (or MIGRATING note) — field list + refusal behavior; no rot-prone version literals per .claude/rules/documentation.md
- [ ] T029 [P] Closure evidence: run `stackctl roadmap reconcile`; propose `roadmap advance` for multi:gap/audit-barrage-{model-pinning,readonly-enforcement,timeout-observability} and surface backlog TASK-26 progression — evidence only, operator owns the status transitions

## Dependencies

- Phase 2 (T002–T005) blocks all stories.
- US1 (T006–T010) and US2 (T011–T015) are independent of each other after Phase 2 — parallelizable across worktrees/agents.
- US3 (T016–T020) consumes the terminal-state fields (Phase 2) and is most meaningful after US2's timeout path exists, but is testable with fixture results alone — independent in the test sense.
- US4 (T021–T026) depends on Phase 2 + the spawn wiring touched in US1/US2 (same file `spawn-cli.ts` — coordinate, don't parallelize edits to it).
- Phase 7 last.

## Parallel Execution Examples

- T002 ∥ T003 (different test files).
- After Phase 2: US1 (T006→T010) ∥ US2 (T011→T015) — different modules except the final template task; land T010/T015 template edits sequentially.
- T011 ∥ T013 RED authoring (different test files); T021 ∥ T023 likewise.
- T028 ∥ T029 (different surfaces).

## Implementation Strategy

MVP = Phase 1 + Phase 2 + US1 + US2 (both P1): mechanically-safe spawns that complete. US3 then makes failure loud; US4 makes failure fast. Each checkpoint is a shippable increment; commit + push at every task boundary (Principle VII); every fix found mid-way is scoped in, TDD-first (Development Workflow gate).
