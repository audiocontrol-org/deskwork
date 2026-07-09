# Tasks: Model-tier task annotation at the tasks-authoring seam

**Feature**: `specs/035-model-tier-task-annotation` · **Branch**: `feature/model-tier-task-annotation`
**Inputs**: [plan.md](./plan.md), [spec.md](./spec.md), [data-model.md](./data-model.md), [research.md](./research.md), [contracts/tier-vocab-verb.md](./contracts/tier-vocab-verb.md), [contracts/render-tier-requirement.md](./contracts/render-tier-requirement.md)

> **Dogfood note (deliberate).** The tier-annotation auto-injection this feature builds does **not exist yet**, so this `tasks.md` is **hand-annotated** with `[tier:<label>]` (dogfood `tier_map`: `fast→haiku`, `balanced→sonnet`, `powerful→opus`) per the existing 033 requirement, so `/stack-control:execute` can dispatch it. That manual backfill **is exactly the friction this feature removes** — a dogfood signal to keep. Tiers assigned by this feature's own heuristic (FR-004): RED-test / doc / mechanical → `fast`; standard implementation → `balanced`; cross-cutting / seam / architectural / multi-file → `powerful`.

> **Test-First (Constitution Principle I, NON-NEGOTIABLE):** every differentiated unit lands a RED test on a fixture BEFORE its implementation. RED tasks precede their impl task and must fail for the right reason first.

## Phase 1: Setup

- [ ] T001 [P] [tier:fast] Create test fixtures dir `src/__tests__/workflow/fixtures/tier-vocab/` with config variants (three-label `fast/balanced/powerful`; non-default `cheap/mid/frontier`; two-label; four-label incl. `fable`; tie two-labels→same model; malformed `tier_map`; absent `tier_map`) — fixtures only, no logic.

## Phase 2: Foundational (blocking prerequisites for all stories)

**The model-capability ranking, the single-source render module, and the read verb — every user story builds on these. Complete Phase 2 before Phase 3+.**

### RED tests (write first; must fail)

- [ ] T002 [P] [tier:fast] RED: `MODEL_CAPABILITY_RANK` ordering test in `src/__tests__/execute/accepted-models.test.ts` — asserts the declared ascending order `haiku<sonnet<opus<fable` and that every `ACCEPTED_MODELS` member has a rank (no gaps).
- [ ] T003 [P] [tier:fast] RED: `bucketBindings(tierMap)` ranking tests in `src/__tests__/workflow/tier-ranking.test.ts` — the 5 worked examples from data-model.md § Tier ranking (3-label, two-label collapse, four-label lower-middle, tie-break by label, single-label), asserting exact `{cheapest,mid,mostCapable}` for each.
- [ ] T004 [P] [tier:fast] RED: `renderTierRequirement(vocab)` tests in `src/__tests__/workflow/tier-requirement.test.ts` — block contains the canonical `[tier:<label>]` syntax constant, the FR-004 heuristic text, the concrete bucket labels for a given vocab, and (absent-vocab case) the `[tier:UNSET]` + advisory instruction.
- [ ] T005 [P] [tier:fast] RED: `tier-vocab` verb tests in `src/__tests__/subcommands/tier-vocab.test.ts` — the four states from contracts/tier-vocab-verb.md: configured (JSON labels+models+buckets, exit 0), absent `tier_map` (`{configured:false}` + advisory, exit 0), malformed config (fail loud, exit non-zero), no enclosing installation (fail loud, exit non-zero).

### Implementation (make the RED tests pass)

- [ ] T006 [tier:balanced] Add explicit `MODEL_CAPABILITY_RANK` (ordered `readonly` constant) + a `rankOf(model)` accessor to `src/execute/accepted-models.ts`, documenting `fable` as a declared deterministic ordering (not an absolute-capability claim). Keep the file the single model-vocabulary source (Principle III/IX). (satisfies T002)
- [ ] T007 [tier:powerful] Implement the pure `bucketBindings(tierMap): TierBuckets` ranking function + the shared canonical string constants (syntax + heuristic strings) in NEW `src/workflow/tier-requirement.ts`, per data-model.md § Tier ranking (even-count lower-middle median, two-label collapse to cheaper, tie-break by label ascending). (satisfies T003)
- [ ] T008 [tier:powerful] Implement `renderTierRequirement(vocab)` in `src/workflow/tier-requirement.ts` (single source, mirroring `src/workflow/house-rules.ts` `renderHouseRules()`): renders the injected block — syntax + heuristic + concrete bucket bindings + the absent-vocab `[tier:UNSET]` instruction — consuming the shared constants from T007. Keep under the 300–500 line cap. (satisfies T004)
- [ ] T009 [tier:balanced] Implement `src/subcommands/tier-vocab.ts` — the `stackctl tier-vocab [--json]` read verb: resolve the enclosing installation, load config, emit ranked labels + `bucketBindings` when configured, `{configured:false}` + loud advisory when absent (exit 0 both), fail loud on malformed/no-installation. Mirror `src/subcommands/resolve-tiers.ts`. (satisfies T005 behavior)
- [ ] T010 [tier:powerful] Register `tier-vocab` across the CLI surface (multi-file cross-cut): `src/cli.ts` dispatch, `INTERNAL_VERBS`, the `spec-misc.ts` help descriptor (working `--help`), and `fronted-operations` (read-only ⇒ mediation-exempt, but skill↔verb parity + `--help` required so `check-front-door` stays green). (completes T005 registration)

## Phase 3: US1 born-complete + US4 deterministic floor (Priority: P1)

**Goal**: tasks generated through the define seam are born tier-complete (US1); the fail-loud floor is provably preserved (US4).
**Independent test**: author a `tasks.md` via the define seam on a `tier_map`-configured install → `resolve-tiers --spec <dir>` exits 0 with a model per task, zero manual edits.

- [ ] T011 [P] [US1] [tier:fast] RED: define-seam wiring assertion in `src/__tests__/workflow/define-tier-seam.test.ts` — asserts `skills/define/SKILL.md` invokes `tier-vocab` and injects the `renderTierRequirement` block at the tasks-authoring step (structural/content assertion; see plan note on extractability).
- [ ] T012 [US1] [tier:powerful] Wire the tier-requirement injection into `skills/define/SKILL.md` at the tasks-authoring seam — run `stackctl tier-vocab --json`, inject `renderTierRequirement(vocab)` into the `/speckit-tasks` drive, MIRRORING `skills/design/SKILL.md` step 2. Do NOT branch on backend identity (Principle III / FR-002). (satisfies T011)
- [ ] T013 [P] [US4] [tier:fast] RED: floor-preservation regression test in `src/__tests__/execute/resolve-tiers-floor-preserved.test.ts` — an untagged task still yields `no-tier` (exit non-zero), an unknown label still yields `unknown-tier`, dispatch-nothing — confirming this feature did not weaken the floor.
- [ ] T014 [US4] [tier:fast] Verify (do not modify) `src/execute/resolve-tiers.ts` / `tier-resolution.ts` / `tasks-tier-parser.ts` remain unchanged; the floor is preserved by non-modification. Record the assertion in the test from T013. (satisfies T013)
- [ ] T015 [US1] [tier:balanced] Integration (quickstart scenario 1): on a `fast/balanced/powerful` install, drive the seam to author a `tasks.md`, then assert `resolve-tiers` exits 0 with a model per task and zero manual tier edits.

## Phase 4: US2 vocabulary awareness (Priority: P2)

**Goal**: proposed labels come only from the installation's actual `tier_map` (no hardcoded vocabulary).
**Independent test**: on a `cheap/mid/frontier` install, generated labels ⊆ `{cheap,mid,frontier}`, zero `unknown-tier`.

- [ ] T016 [P] [US2] [tier:fast] RED: non-default-vocabulary integration test in `src/__tests__/workflow/tier-vocab-nondefault.test.ts` — a `cheap/mid/frontier` `tier_map` ⇒ `tier-vocab` buckets bind `cheapest:cheap / mid:mid / mostCapable:frontier`, and the rendered block references only those labels (no `fast/balanced/powerful`).
- [ ] T017 [US2] [tier:balanced] Confirm `tier-vocab` + `renderTierRequirement` read the installation's labels end-to-end (no hardcoded set anywhere in the path); resolve on the non-default install reports zero `unknown-tier`. (satisfies T016)

## Phase 5: US3 operator override (Priority: P3)

**Goal**: proposed tiers are editable; a reviewed `tasks.md` is not clobbered by generation.
**Independent test**: edit a proposed tier → `resolve-tiers` reflects the edit; regeneration does not overwrite a reviewed file.

- [ ] T018 [P] [US3] [tier:fast] RED: override-survival test in `src/__tests__/workflow/tier-override.test.ts` — an edited `[tier:powerful]` resolves to the `powerful` model (edit honored), and the seam instruction does not re-run generation over a reviewed `tasks.md` without operator action.
- [ ] T019 [US3] [tier:balanced] Ensure the `skills/define/SKILL.md` seam instruction states operator override + non-clobber (a reviewed/edited `tasks.md` is preserved; regeneration is operator-initiated). (satisfies T018)

## Phase 6: FR-011 / FR-012 template exemplification + drift guard

**Goal**: the static template exemplifies `[tier:]` and cannot drift from the single source.

- [ ] T020 [P] [tier:fast] RED: template drift test in `src/__tests__/workflow/tasks-template-tier-drift.test.ts` — asserts `.specify/templates/tasks-template.md` contains the canonical syntax + heuristic string constants exported from `src/workflow/tier-requirement.ts` (FR-012 realization for the static consumer).
- [ ] T021 [tier:balanced] Update `plugins/stack-control/.specify/templates/tasks-template.md`: add `[tier:<label>]` to the sample task lines and update the Format line + tier documentation to the canonical strings from T007. (satisfies T020, FR-011)

## Phase 7: Polish & cross-cutting

- [ ] T022 [tier:balanced] Confirm `stackctl check-front-door` stays green (65+ ops, `tier-vocab` fronted with working `--help` + skill↔verb parity); fix any parity gap surfaced.
- [ ] T023 [P] [tier:balanced] Run the full `npx vitest` suite + `tsc --noEmit`; all green. Run the [quickstart.md](./quickstart.md) scenarios end-to-end (configured, absent→UNSET, override, drift).
- [ ] T024 [P] [tier:fast] Record the dogfood signal (hand-backfilled this tasks.md) in `DEVELOPMENT-NOTES.md` / the session journal — the friction this feature removes, observed first-hand.

## Dependencies & completion order

- **Phase 1 → Phase 2**: fixtures before foundational tests.
- **Phase 2 is a hard prerequisite** for Phases 3–7 (the render module + ranking + verb underpin every story).
- **Within Phase 2**: RED (T002–T005) before impl (T006–T010); T007 before T008 (shared constants); T009 before T010 (verb before its registration).
- **US1/US4 (Phase 3)** are the P1 MVP; they depend only on Phase 2.
- **US2 (Phase 4)** depends on Phase 2 (ranking) — largely proven there; Phase 4 adds the non-default-vocab integration.
- **US3 (Phase 5)** depends on the seam (T012).
- **Phase 6** depends on the shared constants (T007).
- **Phase 7** depends on everything.

## Parallel execution examples

- **Phase 2 RED wave**: T002, T003, T004, T005 in parallel (distinct test files).
- **Phase 3 RED**: T011 and T013 in parallel (distinct files, distinct stories).
- **Cross-story RED**: T016, T018, T020 in parallel once Phase 2 impl is green.

## Implementation strategy (MVP first)

1. **MVP = Phase 1 + Phase 2 + Phase 3 (US1/US4).** Delivers born-complete tasks on the dogfood install with the deterministic floor provably intact — the core value.
2. **Increment 2 = Phase 4 (US2).** Proves vocabulary-awareness on a non-default install.
3. **Increment 3 = Phase 5 (US3) + Phase 6 (template/drift).** Override + static-consumer single-sourcing.
4. **Phase 7** closes out (front-door parity, full suite, quickstart, dogfood journal).
