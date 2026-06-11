# Tasks: Installation Isolation

**Input**: Design documents from `specs/installation-isolation/` (spec.md, plan.md, research.md R1–R8, data-model.md, contracts/cli-contracts.md, quickstart.md)

**Tests**: REQUIRED — Constitution Principle I (Test-First, NON-NEGOTIABLE). Every behavioral change lands RED-first: the test task MUST be committed failing-for-the-expected-reason before its fix task starts. All source paths below are relative to `plugins/stack-control/`.

**Organization**: one phase per user story. US1 carries the shared anchor primitive (R1) that US2–US5 consume, so it leads; US6 (the tree move) is strictly last. Within a story: RED test(s) → fix → green + regression guard.

## Phase 1: Setup

- [X] T001 Confirm suite baseline green and record the count (`npx vitest run` from `plugins/stack-control/`; expect ~185 files / 1220 tests) — the reconciliation anchor. **Recorded 2026-06-10: 184 files / 1220 tests, all green.**

## Phase 2: Foundational (US1's shared primitive — blocks all stories)

- [X] T002 [US1] RED: isolation-probe harness in src/__tests__/installation-isolation-probe.test.ts — nested fixture builder (outer git repo ⊃ installation seeded via the install primitive), outer-tree snapshot helper (path+size+mtime, excluding the installation subtree + OS tmpdirs), table-driven verb runner; first table rows: audit-barrage (stub fleet config), scope-widen auto-seed (the recorded violators — research rows 1, 5). Expect RED: both write at the outer root today. Commit the RED state.
- [X] T003 [US1] Thread the single resolved Installation record (R1): verb-entry resolution via the existing 009 resolver; convert orchestrate-barrage run-dirs (src/scope-discovery/audit-barrage/orchestrate-barrage.ts), config-loader resolution (audit-barrage/config-loader.ts), clone-detector-reader baseline (discovery-agents/clone-detector-reader.ts — share check-clones' boundary path; research row 3 split brain), and scope-widen auto-seed (scope-discovery/scope-widen.ts) to derive from installation.root — T002 rows green
- [X] T004 [US1] Retire `--repo-root` on audit-barrage / audit-barrage-lift / scope-widen / scope-inventory / slush-findings; add `--at <dir>`; RED-first per verb in the existing per-verb test files (flag rejection = existing unknown-flag usage error; --at resolves the named installation) — contracts §flag retirement
- [X] T005 [US1] Extend the probe table to the full R5 verb set (lift, slush-findings, scope-inventory, backlog capture/import, install-scope-discovery) — all rows green (SC-001)

## Phase 3: US2 — No installation, no write (P1)

- [X] T006 [P] [US2] RED: refusal tests (probe harness, marker-less repo fixture) — every state-writing verb exits non-zero naming the start dir + `stackctl setup`; zero new state anywhere (spec US2; contracts §refusal)
- [X] T007 [US2] Route every converted verb's no-installation path through the shared resolver's uniform refusal — T006 green

## Phase 4: US3 — Governance anchors at the installation (P2)

- [X] T008 [P] [US3] RED: govern anchoring tests in src/__tests__/govern-installation-anchor.test.ts — payload committed arm is `git -C <installation> --relative` (installation-relative paths); untracked fold installation-scoped; run-dir inside the installation; `--repo-root`/`GOVERN_REPO_ROOT` refused loudly; excludePaths resolved from the installation record never cwd (TASK-40 regression); cross-tree feature arm: spec artifacts outside the installation fold in as a labeled arm, and a payload that would omit them is FATAL (research R3/R4)
- [X] T009 [US3] Implement: govern.ts (flag retirement, --at, installation threading, resolveGovernExcludePaths from the record), govern/payload-implement.ts (git -C installation --relative + labeled cross-tree feature arm + announcement), govern/protocol.ts threading — T008 green plus the audit-protocol-reliability govern suites green (self-reference exclusions unchanged)

## Phase 5: US4 — cwd never decides placement (P2)

- [X] T010 [P] [US4] RED: three-cwd invariance in the probe (installation root / subdirectory / outer repo with --at → byte-identical placement, SC-003); backlog/root.ts explicit start-point parameter honored when threaded by govern
- [X] T011 [US4] Implement the start-point parameterization (backlog/root.ts + any cwd-walk-up helper) and thread resolved anchors from callers — T010 green

## Phase 6: US5 — Legacy half-installation detected (P2)

- [X] T012 [P] [US5] RED: legacy-notice tests (probe harness fixture: marker-less `.stack-control/` at the outer root + installation below) — three-part notice fires once per invocation from the shared resolver on every resolving verb; absent-legacy fixture is silent (no cry-wolf); advice never names an existing tuned file as an overwrite target (the audit-protocol-reliability AUDIT-09/-15 lesson); writes never target the legacy location (contracts §notices; research R6)
- [X] T013 [US5] Implement the legacy probe + notice in the shared resolver (codebase-boundary.ts) — T012 green
- [X] T014 [US5] This repo's migration (operator-approved step): move the root `.stack-control/` legacy state (audit-barrage-config.yaml, audit-runs/) into the installation; record the move in the quickstart notes; SC-004's re-runnable probe (no verb recreates root state) green

## Phase 7: US6 — Spec Kit root relocates into the installation (P3)

- [X] T015 [P] [US6] RED: installation-aware feature-root resolution in src/__tests__/feature-root-installation.test.ts — `<installation>/specs/<slug>` resolves first (exact slug + grandfathered `NNN-slug`); legacy root-level specs/ + docs layouts stay read-resolvable byte-compatibly (descriptive-naming forward-only decision)
- [X] T016 [US6] Implement the installation-first lookup in scope-discovery/util/feature-root.ts (+ discoverFeatureRoots) — T015 green
- [X] T017 [US6] The tree move (this repo): `git mv .specify specs plugins/stack-control/`; update the repo-root CLAUDE.md SPECKIT pointer + .specify/feature.json validity + extension wiring paths; verify per quickstart (spec-check all-yes on the relocated dir; one authoring step lands under the installation; govern payload carries spec artifacts with no cross-tree arm) — full suite green after the move
- [X] T018 [US6] Record the installation-anchor principle at governance level (FR-010): constitution amendment (Additional Constraints) naming the isolation invariant + derived external anchors; cite this spec

## Phase 8: Polish & feature close-out

- [ ] T019 Full-suite reconciliation: `npx vitest run` green; report N→M with +K new test blocks reconciled against T001 (journal convention AUDIT-04)
- [ ] T020 Run the quickstart per-story validations end-to-end; record outcomes in this file's notes; `stackctl spec-check --spec <relocated specs>/installation-isolation` all-yes
- [ ] T021 Append progression evidence to the originating backlog item (anchor unification — TASK-45 alias) with commit hashes; status transition stays the operator's call

## Dependencies

- T001 → everything. T002–T005 (US1 + the probe) are the foundation: T003 blocks T007/T009/T011/T013 (they thread the record T003 introduces); the probe harness (T002) is reused by T006/T010/T012.
- US6 is strictly LAST (T017 moves the tree everything else resolves against); T015/T016 may land before T017 (the lookup handles both layouts).
- Within each story: RED strictly precedes fix; commit the RED state first.

## Implementation strategy

US1+US2 are the MVP (the invariant + its refusal). US3/US4 harden the heaviest writer and the cwd class; US5 unblocks this repo's cleanup; US6 closes the dogfood loop and dissolves the cross-tree fold. Each story is shippable alone; suggested order is phase order.
