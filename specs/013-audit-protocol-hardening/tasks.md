# Tasks: Audit-Protocol Hardening — Layout-Aware Feature & Audit-Log Resolution

**Feature**: `specs/013-audit-protocol-hardening/` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Tests**: REQUIRED — Constitution Principle I (Test-First, NON-NEGOTIABLE) + spec FR-010 / research D6. Every behavioral task is preceded by a RED test seen failing on current code.

All source paths are under `plugins/stack-control/`.

## Phase 1: Setup

- [ ] T001 Confirm the Vitest harness runs for `src/scope-discovery/util` and `src/subcommands` (`npx vitest run src/scope-discovery/util` from `plugins/stack-control/`) and that the existing `src/scope-discovery/util/__tests__/feature-root.test.ts` suite is green before any change (baseline).

## Phase 2: Foundational (blocking prerequisite for both stories)

- [ ] T002 [US1] Extend the `ResolveFeatureRootResult` type with an optional `layout?: 'legacy-docs' | 'speckit'` field in `src/scope-discovery/util/feature-root.ts` (additive only — existing `const { root } = ...` destructuring must keep compiling). No resolution-logic change yet.

> Why foundational: US2's scaffold writes at the root US1 resolves; US2 depends on US1. US1 is the MVP.

## Phase 3: User Story 1 — Layout-aware feature/audit-log resolution (Priority: P1) 🎯 MVP

**Goal**: `resolveFeatureRoot` resolves a `specs/NNN-slug/` feature (and its `audit-log.md`) in addition to the legacy `docs/<version>/001-IN-PROGRESS/<slug>/`, with deterministic precedence and fail-loud on neither — unblocking governance on spec-structured features.

**Independent test**: `resolveFeatureRoot({ repoRoot, slug })` returns the `specs/NNN-slug` root for a spec-layout fixture, the legacy root for a docs fixture (lex-greatest preserved), the speckit root when both exist, and fails loud when neither — see [contracts/resolve-feature-root.md](./contracts/resolve-feature-root.md).

### Tests for US1 (RED first — write, run, watch fail)

- [ ] T003 [P] [US1] RED: add a `specs/NNN-<slug>` resolution case to `src/scope-discovery/util/__tests__/feature-root.test.ts` — fixture `<repoRoot>/specs/013-audit-protocol-hardening/`, assert `resolveFeatureRoot({ repoRoot, slug: 'audit-protocol-hardening' })` → `root` ends with `specs/013-audit-protocol-hardening` and `layout === 'speckit'`. Also assert exact-name match (`specs/<slug>/` no prefix). Watch both fail on current code.
- [ ] T004 [P] [US1] RED: add a precedence case (slug under BOTH layouts → `speckit` root wins, deterministic) and a numeric-prefix ambiguity case (two `specs/<n>-<slug>` dirs → fail loud naming candidates) to `feature-root.test.ts`. Watch fail.
- [ ] T005 [P] [US1] RED: add a neither-layout case — assert the consumer fail-loud path names BOTH searched layouts. Place the consumer-level assertion in `src/subcommands/__tests__/spec-governance-gate.test.ts` (or the lift test), exercising the real "audit-log not found / feature unresolvable" branch for a spec-layout slug. Watch fail.
- [ ] T006 [US1] Confirm the existing `'picks lex-greatest, NOT semver-greatest, when they diverge'` test in `feature-root.test.ts` remains unmodified — it is the backward-compatibility regression wall (FR-004). (No new test; record that it must stay green.)

### Implementation for US1 (make T003–T005 GREEN, keep T006 GREEN)

- [ ] T007 [US1] Implement the `speckit` branch in `resolveFeatureRoot` (`src/scope-discovery/util/feature-root.ts`): derive `<repoRoot>/specs`, match a child dir named exactly `<slug>` or `^\d+-<slug>$`; on multiple matches throw a fail-loud error naming candidates; set `layout: 'speckit'`. Run the `speckit` branch BEFORE the legacy walk (specs-first precedence, research D3).
- [ ] T008 [US1] Preserve the legacy `docs/<version>/001-IN-PROGRESS/<slug>` walk unchanged below the speckit branch; set `layout: 'legacy-docs'` on its return. Update the resolver doc-comment to document the two-layout precedence + the lex-greatest contract still pinned.
- [ ] T009 [US1] Make the neither-layout fail-loud message name both searched layouts. In `src/subcommands/spec-governance-gate.ts` (the must-fix call site, `:120-130`) ensure the "unresolvable / audit-log not found" error names both `specs/<NNN>-<slug>` and `docs/<version>/001-IN-PROGRESS/<slug>` (no fallback; Principle V).
- [ ] T010 [US1] Verify (and adjust only if needed) the other three helper-callers — `src/subcommands/audit-barrage-lift.ts`, `src/subcommands/slush-findings.ts`, `src/subcommands/backlog.ts` — resolve a `specs/` feature through the widened helper with no per-call hardcoded `docs/*/001-IN-PROGRESS` path on the audit-log/governance path. Add a targeted assertion where a behavioral gap exists.

**Checkpoint**: US1 independently testable — governance resolves `specs/013` (SC-001), legacy unchanged (SC-002), precedence + fail-loud (SC-004). This is a shippable MVP.

## Phase 4: User Story 2 — First-barrage audit-log scaffold (Priority: P2)

**Goal**: `audit-barrage-lift` scaffolds the audit-log from the canonical header at the resolved root when absent, instead of aborting — so a brand-new feature's first barrage lands.

**Independent test**: lift against a resolved feature root with no `audit-log.md` + a populated run-dir creates the canonical-header file and lands findings; re-lift against the explicit run-dir does not strand — see [contracts/audit-log-scaffold.md](./contracts/audit-log-scaffold.md).

### Tests for US2 (RED first)

- [ ] T011 [P] [US2] RED: add a scaffold-on-missing-audit-log test to `src/subcommands/__tests__/audit-barrage-lift.test.ts` — fixture resolved root with NO `audit-log.md` + a run-dir; assert lift creates `audit-log.md` with frontmatter (`slug`, `targetVersion`) + `# Audit log — <slug>` and appends the run section, instead of `return 2`. Watch fail.
- [ ] T012 [P] [US2] RED: add an explicit-run-dir re-lift test (FR-008) — barrage fired, tip unchanged; assert lift against the explicit run-dir lands findings (no no-new-diff strand). Watch fail.

### Implementation for US2 (make T011–T012 GREEN)

- [ ] T013 [US2] Replace the `:273-274` abort in `src/subcommands/audit-barrage-lift.ts` with a scaffold: when the resolved `audit-log.md` is absent, write the canonical header (frontmatter + `# Audit log — <slug>`; `targetVersion` from resolution, `""`/omitted for `speckit`) via the existing `atomicWriteFile`, then continue to the existing append path. Keep the idempotent-header behavior for an existing file.
- [ ] T014 [US2] Ensure the explicit-run-dir re-lift path lands findings without the no-new-diff guard stranding them (FR-008), reconciling with the scaffold so a fired-but-un-lifted barrage completes.

**Checkpoint**: US2 independently testable — first barrage of a `specs/` feature scaffolds + lands (SC-003).

## Phase 5: Polish & Cross-Cutting

- [ ] T015 [P] Run the full suite from `plugins/stack-control/` (`npx vitest run`) — all green, including the preserved lex-greatest regression test (SC-002, SC-006).
- [ ] T016 [P] SC-005 verification: `grep -rn "001-IN-PROGRESS" plugins/stack-control/src --include='*.ts' | grep -v feature-root.ts | grep -v __tests__` — confirm no audit-log/governance consumer constructs the path outside the helper; any remaining hits are the scope-discovery follow-on (TASK-24) and are listed as such.
- [ ] T017 End-to-end unblock check: run the governance/gate path against `specs/013-audit-protocol-hardening` and confirm it resolves the audit-log (the run that is blocked today) with no manual path flag (SC-001).

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002)** → **US1 (T003–T010)** → **US2 (T011–T014)** → **Polish (T015–T017)**.
- **US2 depends on US1** (the scaffold writes at the root the widened resolver returns). US1 is the MVP and ships independently.
- Within US1: tests T003–T005 [P] (different assertions, same/new test files — coordinate edits to `feature-root.test.ts`), then impl T007–T008 (same file `feature-root.ts`, sequential), then T009–T010 (different files, [P]-able).
- Within US2: tests T011–T012 [P], then impl T013–T014 (same file, sequential).

## Parallel Execution Examples

- US1 tests: T003, T004 touch `feature-root.test.ts` (coordinate — same file), T005 touches the gate test (truly [P]).
- Polish: T015 and T016 are independent ([P]).

## Implementation Strategy

- **MVP = US1** (Phase 3): the layout-aware resolver is the actual unblock; ship it first and the governance-on-`specs/` blocker is gone.
- **US2** is the natural follow-on for unattended first-barrage flows; small and on the same surface.
- The scope-discovery direct-path reconciliation is **out of scope** (TASK-24) and intentionally not a task here.
