# Tasks: Governance Code Scope

**Feature**: `impl:feature/governance-code-scope` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Test-First (NON-NEGOTIABLE, Constitution I)**: every implementation task is preceded by a RED failing-test task. Do not write implementation before its test fails for the right reason.

**Conventions**: `[P]` = parallelizable (different file, no incomplete-task dependency). `[US#]` = user-story phase task. Paths are relative to `plugins/stack-control/`. Each task commits **and pushes** at its boundary (Constitution VII). Every task cites the FR/SC it serves.

**Deterministic-floor testing** (per `.claude/rules/audit-barrage-is-stochastic-defense-in-depth.md`): all tests are vitest over on-disk fixture trees (never mock the filesystem); the filter is a decidable transform verified on the compiler/test floor.

---

## Phase 1: Setup

- [ ] T001 Add `picomatch` `^2.3.2` to `plugins/stack-control/package.json` `dependencies` (already resolved transitively; make it a declared dep) and run `npm install`; confirm `node -e "require('picomatch')"` resolves. (research §Decision 1)

## Phase 2: Foundational (blocking — config type + config parsing + the pure filter module)

**These block all user stories: the filter and every arm depend on the config type and the `code-scope` module.**

- [ ] T002 [P] Add `GovernConfig` + `GovernCodeScopeConfig` interfaces to `src/config/types.ts`; extend `InstallationConfig` with optional `govern?: GovernConfig`. Type-only, no behavior. (Spec §Key Entities; FR-005)
- [ ] T003 RED: write `src/__tests__/govern/code-scope.test.ts` covering contract C1–C8 — `resolveCodeScopePolicy(undefined)` yields defaults (FR-006); `code_only:false` ⇒ `applyCodeScope` identity (C1/FR-007); drop `docs/PRD.md` keep `src/foo.ts` (C2/FR-001); keep `x/SKILL.md` include-wins (C3/FR-004); root `README.md` dropped, root `CLAUDE.md` kept (C4/FR-009); survivor per-file diff unchanged (C5/FR-003); operator `include:["**/*.md"]` keeps all markdown, replace-not-merge (C6/FR-008); malformed `exclude` throws naming the key (C7/Principle V); `summarizeCodeScope` sets `emptiedScope` when before non-empty & after empty (C8/FR-014). Tests MUST fail (module absent). (FR-001,003,004,006,007,008,009,013,014)
- [ ] T004 Implement `src/govern/code-scope.ts` to green T003: `DEFAULT_EXCLUDE`/`DEFAULT_INCLUDE`, `CodeScopePolicy`, `resolveCodeScopePolicy` (defaults-when-absent, replace-not-merge, throw-on-malformed), `applyCodeScope` (identity when inactive; drop iff `exclude ∧ ¬include`, include wins; preserve survivors' `fileDiffs`; `picomatch(glob,{dot:true})` matchers compiled once), `summarizeCodeScope`. Keep the file under the 300–500-line cap. (FR-001,003,004,006,007,008,009,013)
- [ ] T005 RED: write `src/__tests__/govern/code-scope-config.test.ts` — the config loader parses a `govern` block from YAML, translates snake→camel (`code_only`→`codeOnly`, `code_scope`→`codeScope`), returns `undefined` govern when the block is absent, and **throws** on a malformed block (non-boolean `code_only`; non-array list). Fails (loader unaware of `govern`). (FR-005,006,008; Principle V)
- [ ] T006 Implement the `govern`-block parse/translate in `src/config/config-loader.ts` to green T005 (throw-on-malformed, no silent default). (FR-005,006,008)

**Checkpoint**: pure filter + config plumbing complete and unit-green — user stories can proceed.

## Phase 3: User Story 1 — Implement-time governance audits only code (P1) 🎯 MVP

**Goal**: the implement-mode payload excludes documentation and retains code, through the single scope seam, surviving the mid-fix re-scope.

**Independent test**: run implement-mode govern over a mixed code+docs diff with the default policy; assert the payload's file set contains code (incl. `SKILL.md`) and excludes docs.

- [ ] T007 [US1] RED: write `src/__tests__/govern/code-scope-integration.test.ts` — through the runtime `scopeDiff` closure, a mixed `DiffScope` is filtered to code (docs dropped, `SKILL.md` kept), per-file diffs preserved; the mid-fix re-scope path applies the same filter (docs added by a fix do not leak). Fails (seam not composed). (FR-002,003; US1 scenarios 1–4)
- [ ] T008 [US1] Thread `CodeScopePolicy` through `runImplementArm` in `src/govern/govern-arms.ts`: resolve the policy (via `resolveCodeScopePolicy` on the installation config, near `resolveImplementExclusion`) and pass it into the runtime config alongside `excludeDiffPaths`. (FR-002)
- [ ] T009 [US1] Compose `applyCodeScope` at the `scopeDiff` seam in `src/govern/end-govern-runtime.ts` (wrap `filterDiffScope(scopeCommittedDiff(...))` so both the initial scope and the mid-fix re-scope inherit it) to green T007. Do not change `end-govern-pipeline.ts` logic here. (FR-001,002)

**Checkpoint**: US1 delivers the core value — code-only implement payload. This is the MVP.

## Phase 4: User Story 2 — Operator tunes the code/documentation boundary (P2)

**Goal**: operators control the boundary via config; toggle-off restores today's behavior exactly.

**Independent test**: set `code_only:false` → payload identical to today; add an `include` glob → a matching `.md` survives.

- [ ] T010 [US2] RED: extend `code-scope-config.test.ts` (or add `code-scope-toggle.test.ts`) — end-to-end through the runtime, `code_only:false` yields a byte-identical file set + diffs to the no-filter path (SC-004 identity); an operator `include:[...,"test/fixtures/**/*.md"]` rescues a changed fixture `.md`; supplied lists replace defaults. Fails if toggle/threading is incomplete. (FR-007,008; SC-004; US2 scenarios 1–4)
- [ ] T011 [US2] Confirm/adjust the threading so `code_only:false` short-circuits to identity at the seam (no filtering cost) and operator lists flow through `resolveCodeScopePolicy`; green T010. (FR-007,008)

**Checkpoint**: US2 delivers operator control + the escape hatch.

## Phase 5: User Story 3 — Documentation-only change graduates cleanly (P3)

**Goal**: an emptied-by-code-only scope is a success, not a fatal, and permits graduation.

**Independent test**: run govern on a docs-only diff → "nothing to govern — no code in scope" success; graduation permitted.

- [ ] T012 [US3] RED: write `src/__tests__/govern/code-scope-empty.test.ts` — when code-only filtering reduces a non-empty scope to empty, the pipeline returns the "nothing to govern — no code in scope" success (not the empty-scope FATAL); a genuinely-empty diff still hits the existing guard; the success satisfies the graduation precondition. Fails (pipeline still FATALs). (FR-011; US3 scenarios 1–2; research §Decision 3)
- [ ] T013 [US3] Implement the empty-code-scope success path in `src/govern/end-govern-pipeline.ts` — distinguish "emptied by code-only filtering" from "genuinely empty diff"; return the success outcome that satisfies graduation. Minimal change; do not alter other pipeline logic. (FR-011)

**Checkpoint**: US3 handles the docs-only edge without blocking legitimate changes.

## Phase 6: Polish & Cross-Cutting (lens, observability, validation)

- [ ] T014 RED: write `src/__tests__/govern/code-scope-lens.test.ts` — when `code_only` active, the rendered implement lens contains no documentation-drift instruction; when `code_only:false`, the original `CODE_AUDIT_LENS` (with the doc-drift bullet) is used. Fails (variant absent). (FR-010; SC-006)
- [ ] T015 Add a code-only variant of `CODE_AUDIT_LENS` in `src/govern/audit-constants.ts` (identical minus the doc-drift bullet) and select it by the `code_only` toggle where `audit_lens`/`BarrageVars` is set in `src/govern/govern-vars.ts`; green T014. (FR-010)
- [ ] T016 RED: extend a govern-arm test (or add `code-scope-summary.test.ts`) asserting the concise exclusion summary — count of excluded files + "code-only active", NOT the full path list; empty-scope reason present on the success path; no summary when nothing excluded. Fails (no emission). (FR-014; SC-007)
- [ ] T017 Emit the concise exclusion summary from `runImplementArm` (using `summarizeCodeScope`) — count only, empty-scope reason on the success path; green T016. (FR-014)
- [ ] T018 [P] Update the config docs / a `.stack-control/config.yaml` example (and any govern SKILL/help text) to document the `govern` block, defaults, include-wins, and the fixture-rescue example from quickstart §3. (Spec §US2; quickstart)
- [ ] T019 Run the quickstart validation live: `./bin/stackctl govern --mode implement` over a mixed diff (payload code-only + summary), a `code_only:false` diff (identity), and a docs-only diff ("nothing to govern" success). Record evidence in `quickstart.md`. (SC-001..006)
- [ ] T020 [P] Final gate: `npx tsc --noEmit` clean + `npx vitest` green across the new suites; confirm `code-scope.ts` under the file-size cap. (Constitution I, VI)

---

## Dependencies & Execution Order

- **Phase 1 (T001)** → **Phase 2 (T002–T006)** blocks everything (types + module + config parsing).
- **US1 (T007–T009)** depends on Phase 2. This is the MVP — stop here for a minimal viable slice.
- **US2 (T010–T011)** depends on Phase 2 + US1 threading.
- **US3 (T012–T013)** depends on US1 (the seam must filter before empty-scope can arise).
- **Polish (T014–T020)** depends on US1; lens/observability are independent of US2/US3 and can interleave.

### Parallel opportunities

- T002 `[P]` (types) can start immediately in Phase 2.
- Within polish: T018 `[P]` (docs) and T020 `[P]` (final gate prep) are file-independent of the lens/summary code tasks.
- The RED test tasks for different files (T007, T012, T014, T016) are independent once Phase 2 is green.

## Implementation Strategy

- **MVP = Phase 1 + Phase 2 + US1 (T001–T009).** Delivers code-only implement payloads — the feature's core value.
- **Increment 2 = US2 + US3** (operator control + docs-only success).
- **Increment 3 = Polish** (lens omission, observability summary, live validation, final gate).

## Independent Test Criteria

- **US1**: mixed diff → payload contains code (incl. `SKILL.md`), excludes docs; mid-fix re-scope stays code-only.
- **US2**: `code_only:false` → today's payload exactly; `include` glob rescues a matching `.md`; malformed config throws.
- **US3**: docs-only diff → "nothing to govern" success, graduation permitted.

## Out of Scope (no tasks)

- Reframing/retiring `multi:gap/govern-doc-aware-audit-lens` (operator-owned roadmap disposition).
- Spec-mode governance changes; clone sub-step (already code-only).
- List-merge ergonomics, auto fixture-detection (design open questions, deferred).
