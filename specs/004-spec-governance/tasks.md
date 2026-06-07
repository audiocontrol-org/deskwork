---
description: "Task list for design/spec-governance implementation"
---

# Tasks: Govern the spec, not just the implementation (`design/spec-governance`)

**Input**: Design documents from `specs/004-spec-governance/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED and REQUIRED — Constitution Principle I (Test-First, NON-NEGOTIABLE). Every behavioral task is preceded by a RED test (Vitest for the verb, Bash smoke for the orchestration script).

**Organization**: by user story (US1/US2/US3 from spec.md) plus a dedicated convergence-gate phase (FR-010/FR-014, the audit-protocol port — not a separate user story but the spec's load-bearing core).

**Composition note**: this feature composes EXISTING dw-lifecycle verbs in-house (`audit-barrage-render` → `audit-barrage` → `audit-barrage-lift`) and ports the `check-barrage-dampener` convergence logic. Do NOT reimplement the barrage or the protocol (FR-006 / Principle II).

## Format: `[ID] [P?] [Story?] Description with file path`

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Create the extension skeleton dirs `plugins/stack-control/spec-kit/spec-governance/commands/` and `.../scripts/bash/`, plus the test dir `plugins/stack-control/tests/spec-governance/`, mirroring `plugins/stack-control/spec-kit/deskwork-governance/` layout.
- [x] T002 [P] Author fixture spec trees under `plugins/stack-control/tests/fixtures/spec-governance/`: (a) `clean/` (spec with no defects), (b) `high-finding/` (spec with a seeded contradiction → ≥1 HIGH), (c) `history-2runs/` (an `audit-runs/` + `audit-log.md` fixture with two prior runs) for gate tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: blocks all user stories — without the manifest no hook fires.

- [x] T003 Author `plugins/stack-control/spec-kit/spec-governance/extension.yml` per `contracts/spec-governance-extension.md`: `id: spec-governance`, `requires.tools` = dw-lifecycle (required) + git, `provides.commands` = `speckit.spec-governance.govern-spec`, `hooks.after_clarify` (optional:false), `hooks.after_plan` (optional:true). Assert `after_specify` is NOT declared.

**Checkpoint**: the extension is discoverable; user-story implementation can begin.

---

## Phase 3: User Story 1 — Spec is automatically governed at definition time (Priority: P1) 🎯 MVP

**Goal**: at `after_clarify`, the barrage fires automatically over the spec and lifts findings into the audit-log — no manual invocation.

**Independent Test**: drive a fixture spec through the hook; observe a run-dir + a dated audit-log lift section with zero manual barrage commands (SC-001).

### Tests for User Story 1 (RED first) ⚠️

- [x] T004 [P] [US1] RED Bash smoke `scripts/smoke-govern-spec.sh` asserting `govern-spec.sh` over fixture `high-finding/` renders → fires → lifts: a run-dir appears under `.dw-lifecycle/scope-discovery/audit-runs/` and the feature `audit-log.md` gains a dated lift section. Must FAIL (script absent).
- [x] T005 [P] [US1] RED Vitest in `plugins/stack-control/tests/spec-governance/hook-wiring.test.ts` asserting the `after_clarify` hook in `extension.yml` resolves to the `speckit.spec-governance.govern-spec` command. Must FAIL.
- [x] T025 [P] [US1] RED assertion (coverage remediation — FR-009 / analyze C2) in `scripts/smoke-govern-spec.sh` (or a sibling smoke): `govern-spec.sh` over fixture `clean/` (0 findings) STILL produces a recorded run-dir + a dated `audit-log.md` section — a clean re-run is recorded, never pre-emptively skipped (empty revisions beat missed changes). Must FAIL until T007. NOTE: unlike dw-lifecycle `implement-hook`'s no-new-diff guard, `govern-spec.sh` (mirroring `govern.sh`) always runs — assert that.

### Implementation for User Story 1

- [x] T006 [US1] Author `plugins/stack-control/spec-kit/spec-governance/commands/speckit.spec-governance.govern-spec.md` per contract (shells to `govern-spec.sh`; env overrides `GOVERN_FEATURE_SLUG`, `GOVERN_SPEC_PATH`; reports run-dir + verdict).
- [x] T007 [US1] Implement `plugins/stack-control/spec-kit/spec-governance/scripts/bash/govern-spec.sh` core (mirror `deskwork-governance/scripts/bash/govern.sh`): slug derivation (fail-loud on empty), gather the SPEC file into the `diff` var (R2) + the other four render vars, then `audit-barrage-render` → `audit-barrage --output-run-dir` → `audit-barrage-lift --apply`. Makes T004 green.
- [x] T008 [US1] Add `after_plan` artifact handling to `govern-spec.sh`: when invoked from the `after_plan` hook, fold the plan alongside the spec (FR-013). Confirm T005 green (hook wiring).
- [x] T009 [US1] Bound the spec/plan payload fold in `govern-spec.sh` (256 KB soft budget, log drops to stderr — no silent cap; R2/R7).

**Checkpoint**: automatic spec governance fires and surfaces findings (MVP).

---

## Phase 4: User Story 2 — Cross-model agreement is HIGH-confidence + triaged (Priority: P2)

**Goal**: findings from ≥2 model families on the same root cause are labeled HIGH-confidence and routed to triage with dispositions.

**Independent Test**: barrage a spec whose contradiction two families both flag; confirm the merged finding is annotated cross-model/HIGH in the audit-log (SC-002).

### Tests for User Story 2 (RED first) ⚠️

- [x] T010 [P] [US2] RED Vitest `plugins/stack-control/tests/spec-governance/cross-model-lift.test.ts`: given a fixture run-dir with the same root cause from two model files, the composed lift produces a merged finding with `crossModelAgreement` + a disposition slot in `audit-log.md`. Must FAIL until the compose path is exercised.
- [x] T026 [P] [US2] RED Vitest `plugins/stack-control/tests/spec-governance/disposition-persistence.test.ts` (coverage remediation — SC-004 / analyze C1): a disposition set in barrage run N (e.g. a finding marked `acknowledged-<ref>`) is PRESERVED across a subsequent revision's run N+1 — the later run distinguishes still-open from already-dispositioned findings (no disposition loss across revisions). Exercises the reused finding state machine end-to-end. Must FAIL until T011.

### Implementation for User Story 2

- [x] T011 [US2] Ensure `govern-spec.sh` invokes `audit-barrage-lift --apply` such that cross-model agreement annotation + disposition slots are preserved end-to-end (compose, do not reimplement); add the assertion wiring to make T010 green.

**Checkpoint**: US1 + US2 both work; cross-model HIGH signal is visible and triageable.

---

## Phase 5: User Story 3 — Fail loud when the audit capability is absent (Priority: P3)

**Goal**: no silent skip; absent capability fails loud; partial model availability records reduced coverage.

**Independent Test**: remove the barrage entrypoint from PATH → script exits 2, no "governed" claim, no audit-log mutation (SC-003).

### Tests for User Story 3 (RED first) ⚠️

- [x] T012 [P] [US3] RED Bash smoke `scripts/smoke-govern-spec-fail-loud.sh`: with the barrage entrypoint not on PATH, `govern-spec.sh` exits 2, prints an actionable message, and leaves `audit-log.md` unchanged. Must FAIL.
- [x] T013 [P] [US3] RED smoke: with only one of two configured model families available, the run records reduced coverage (not presented as full). Must FAIL.

### Implementation for User Story 3

- [x] T014 [US3] Implement the capability guards in `govern-spec.sh` (mirror `govern.sh`: `command -v` the barrage entrypoint + `jq` → exit 2; empty-slug guard) and degraded-coverage recording. Makes T012 + T013 green.

**Checkpoint**: all three user stories independently functional.

---

## Phase 6: Convergence gate & graduation (FR-010, FR-014 / SC-007, SC-008)

**Goal**: port the dw-lifecycle audit-protocol convergence criterion as a graduation gate (the operator's load-bearing directive). Bounded loop (no infinite spin).

**Independent Test**: the 7 assertions in `contracts/convergence-gate.md`.

### Tests for the gate (RED first) ⚠️

- [x] T015 [P] RED Vitest `plugins/stack-control/tests/spec-governance/gate.test.ts` covering convergence-gate.md assertions #1–#6: converged via single-run-clean (0 HIGH+0 MED), converged via two-consecutive-quiet (0 HIGH), blocked (open HIGH, iterations<ceiling), non-converged (iterations≥ceiling), overridden (recorded reason), capability-absent → exit 2. Must FAIL.
- [x] T016 [P] RED Vitest `plugins/stack-control/tests/spec-governance/gate-port-fidelity.test.ts` (assertion #7): the gate verdict matches `check-barrage-dampener`'s engage decision on identical fixture inputs. Must FAIL.

### Implementation for the gate

- [x] T017 Extract/share the dw-lifecycle `check-barrage-dampener` Rule A/Rule B logic so it is callable in-house (not hand-retyped) — the faithful port surface (Principle VIII / assertion #7). Makes T016 green.
- [x] T018 Implement `plugins/stack-control/src/subcommands/spec-governance-gate.ts` per `contracts/convergence-gate.md`: read the feature's barrage history + open HIGH/MED counts, compute `ConvergenceVerdict` (state/rule/iterations/ceiling/override), exit 0/1/2. Register the verb in the stackctl dispatcher. Makes T015 green.
- [x] T019 Wire the gate into `govern-spec.sh`: after lift, call `stackctl spec-governance-gate --feature <slug>`; emit the verdict; non-zero exit when `blocked`/`non-converged` unless an override is recorded (graduation refused — SC-007).

**Checkpoint**: spec graduation is gated on convergence; the loop is bounded.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T020 [P] Author `plugins/stack-control/spec-kit/spec-governance/README.md` (mirror the deskwork-governance README; no rot-prone version strings — link the releases page).
- [x] T021 [P] Verify Principle VI: every new file (`govern-spec.sh`, `spec-governance-gate.ts`) is < 500 lines; refactor if not.
- [x] T022 Verify the isolation invariant: run the dw-lifecycle suite (`npm --workspace ... test`) — still green; confirm no dw-lifecycle internals were edited (only public verbs composed + the dampener logic shared).
- [x] T023 Run all six `quickstart.md` scenarios end-to-end on a real feature tree.
- [ ] T024 Dogfood (self-hosting): govern THIS spec (`specs/004-spec-governance/spec.md`) and the `impl/execution-engine` spec via the new extension; record findings in the feature audit-log (closes the loop the thesis describes).

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2, extension.yml)** → user stories.
- **US1 (P3 phase)** is the MVP and is a prerequisite in practice for US2/US3 (they extend `govern-spec.sh`), since all three modify the one orchestration script. Within the script, US1 core (T007) precedes US2 (T011), US3 (T014), and gate-wiring (T019).
- **Phase 6 gate** depends on US1 (a run history must exist to evaluate) but its verb (T015–T018) is independent code and can be built in parallel with US2/US3.
- **Polish (P7)** after all desired phases.

### Within each story

- Tests RED before implementation (Principle I).
- `govern-spec.sh` is a single file: T007 → T008/T009 → T011 → T014 → T019 are SEQUENTIAL (same file), not parallel.

### Parallel opportunities

- T002 (fixtures) ∥ T001.
- All RED test tasks across stories are `[P]` (distinct files): T004, T005, T025, T010, T026, T012, T013, T015, T016.
- The gate verb (T015–T018) ∥ US2/US3 work (distinct files).
- Polish T020, T021 are `[P]`.

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (extension.yml) → Phase 3 US1.
2. **STOP & VALIDATE**: a clarified spec auto-fires the barrage and lifts findings (SC-001). Demo.

### Incremental delivery

US1 (auto-governance MVP) → US2 (cross-model HIGH) → US3 (fail-loud) → Phase 6 (convergence gate — the protocol port) → Polish + dogfood. Each increment is independently testable; the gate is the increment that turns "surfaced findings" into "graduation-gated," matching the spec's framing that the MVP is valuable even before the gate.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- Compose dw-lifecycle verbs; never reimplement the barrage/protocol (FR-006).
- Verify each RED test fails for the right reason before implementing.
- Commit + push after each task or logical group (Principle VII).
- This feature's own `after_implement` governance (the founding `impl/governance` extension) still fires when these tasks are implemented — dogfooding both governance phases.
