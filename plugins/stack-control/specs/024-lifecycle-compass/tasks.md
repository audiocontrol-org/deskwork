---
description: "Task list — Lifecycle Compass (024)"
---

# Tasks: Lifecycle Compass — an un-skippable workflow

**Input**: Design documents from `specs/024-lifecycle-compass/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED — Constitution Principle I (Test-First, NON-NEGOTIABLE). Every
implementation task is preceded by a RED test seen to fail for the expected reason before the
GREEN implementation.

**Sequencing note (FR-015, operator-clarified)**: the govern-runnability fixes (US4 /
FR-011/FR-012) and the canonical identity (US6 / FR-013) are the FIRST implementation phases —
"a gate cannot enforce a step that cannot run." Phase order below therefore intentionally does
NOT follow raw spec priority; it follows FR-015. Story labels still map to spec.md user stories.

**Path conventions**: single-project CLI plugin; source under `src/`, tests under
`src/__tests__/`, skills under `skills/`. Paths are repo-relative to `plugins/stack-control/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6 (maps to spec.md user stories); Setup/Foundational/Polish carry none

---

## Phase 1: Setup (Shared types)

**Purpose**: the plain-data shapes every later phase consumes.

- [X] T001 Extend `src/workflow/workflow-types.ts` with `Verdict` (outcome/currentPhase/intentPhase/legitimateNext/skippedStep/reason/exitCode), the `VerdictOutcome` union (`on-course|ahead|behind|off-rail`), the `Intent` shape, and the verdict→exit-code constants (per data-model.md). No behavior — types only.

---

## Phase 2: Foundational (Canonical identity — blocks US4 + US1)

**Purpose**: the one identity resolver govern, the compass, and the convergence record route
through (FR-013). This is the structural prerequisite for both govern-runnability (US4) and
correct compass derivation (US1), so it precedes both.

**⚠️ CRITICAL**: no US4/US1 work begins until the convergence re-key lands.

- [X] T002 [P] RED: `src/__tests__/workflow/canonical-identity.test.ts` — `resolveIdentity` returns the node id as `nodeId` and the node's `spec:` as `specPointer`; two fixture items whose spec dirs share a basename resolve to distinct `nodeId`s (per contracts/canonical-identity.md). Seen to fail.
- [X] T003 Create `src/workflow/identity.ts` — `resolveIdentity(installationRoot, item) → { nodeId, specPointer, specDir }`, install-anchored (FR-013). GREEN T002.
- [X] T004 RED: convergence-key test in `src/__tests__/workflow/canonical-identity.test.ts` — the govern-convergence record is keyed by `nodeId`, not `basename(item.spec)` (TASK-139). Seen to fail.
- [X] T005 Re-key the convergence record by canonical identity: replace `basename(item.spec)` with `resolveIdentity(...).nodeId` in `src/workflow/workflow-context.ts` (`convergenceKey`) and the read/write paths in `src/govern/convergence-record.ts`. GREEN T004. (Keep records ≤ cap; no schema change beyond the key.)

**Checkpoint**: one canonical identity; convergence no longer collides on basename.

---

## Phase 3: User Story 4 — Govern runnable on the session-pinned branch (FR-011/FR-012) 🎯 leads per FR-015

**Goal**: `govern` resolves the feature from the item's spec pointer (not the branch slug) and
no longer crashes on a `/stack-control:*` backtick span — so the back-half gate is satisfiable.

**Independent Test**: on `feature/stack-control`, `govern` for an item with a `spec:` pointer
resolves the feature (no branch-slug FATAL) and assembles a payload over a spec containing a
`/stack-control:define` backtick span (no "escapes the installation root" FATAL).

- [X] T006 [P] [US4] RED: `src/__tests__/govern/govern-resolution.test.ts` — item-driven govern on a `feature/<non-spec-slug>` branch with a `spec:` pointer resolves the feature (no "feature not found" FATAL) (FR-011). Seen to fail.
- [X] T007 [P] [US4] RED: in the same test file — `extractScopedPaths` over a body containing a `` `/stack-control:define` `` span returns NO path for that token AND still returns a genuine `` `src/govern/protocol.ts` `` span (FR-012 / TASK-83). Seen to fail.
- [X] T008 [US4] FR-012 fix in `src/govern/incremental-audit.ts` `extractScopedPaths`: skip skill-reference tokens (a `/<plugin>:<verb>` `:`-bearing token / a token that is not a plausible installation-relative path) before the governed-path validator; keep real path spans. GREEN T007. (Must NOT grow `incremental-audit.ts` past the 300–500-line cap.)
- [X] T009 [US4] FR-011 item-driven resolution: in `src/subcommands/govern.ts` (+ the `resolveSlug` seam in `src/govern/protocol.ts`) prefer `resolveIdentity(item).specPointer` / the CLAUDE.md SPECKIT marker over the branch slug when an item is supplied. GREEN T006.
- [X] T010 [US4] Fail-loud guard: when no item `spec:` pointer, no SPECKIT marker, and no `--feature` resolves a feature, `govern` FATALs naming what to supply (Principle V — no silent slug fallback). Test in `govern-resolution.test.ts`.

**Checkpoint**: govern runs on the session-pinned branch; the back-half gate can be enforced.

---

## Phase 4: User Story 6 — One canonical feature identity (FR-013 acceptance)

**Goal**: the compass, govern, the convergence record, and `close-related` all resolve a
feature through the one canonical identity (US6 acceptance over the Phase-2 resolver).

**Independent Test**: two specs sharing a spec-dir basename never collide on any identity-keyed
artifact; compass, govern, and `close-related` agree on the same `nodeId`.

- [X] T011 [P] [US6] RED: `src/__tests__/workflow/canonical-identity.test.ts` — governing item A does not mark item B converged when their spec dirs share a basename (SC-005). Seen to fail (passes once Phase-2 re-key + this path land).
- [X] T012 [P] [US6] RED: `close-related` resolves its target through `resolveIdentity` and agrees with compass + govern on `nodeId` (US6.2). Seen to fail.
- [X] T013 [US6] Route `close-related` (023) through `resolveIdentity` in `src/subcommands/roadmap.ts`. GREEN T012.
- [X] T014 [US6] Legacy migration (read-side, per spec Assumptions): a convergence record written under the old basename key is re-derived under the canonical key on next govern; a record resolvable under neither key is reported, never fabricated. Test the read-side fallback in `canonical-identity.test.ts`.

**Checkpoint**: one identity across all four subsystems; basename collision class eliminated.

---

## Phase 5: User Story 1 — The compass orients and diffs intent (FR-001..005) 🎯 MVP

**Goal**: `workflow compass <item> [--intent <action>]` returns a deterministic, read-only
verdict + gating exit code over the existing 022 derivation.

**Independent Test**: fixture items at known artifact states → `compass <item>` reports phase +
single legitimate next action + gate state; `--intent` returns on-course/ahead/behind/off-rail
with the matching exit code, deterministically and writing nothing.

- [X] T015 [P] [US1] RED: `src/__tests__/workflow/intent-vocabulary.test.ts` — vocabulary is total over `DEFAULT_PHASES` work skills; a known intent maps to its `work:` phase; an unknown intent throws (exit 2); names the known set (FR-004, contracts/intent-vocabulary.md). Seen to fail.
- [X] T016 [US1] Create `src/workflow/intent-vocabulary.ts` — build the fixed `Map<intent, phaseId>` by inverting `phase.work` from the governed doc + the fixed transition aliases; load-time error if a phase work-skill is unmappable. GREEN T015.
- [X] T017 [P] [US1] RED: `src/__tests__/workflow/compass.test.ts` — the verdict matrix (item-state × intent): on-course / ahead (names first skipped step) / behind / off-rail (no node / side-state); `skippedStep !== null ⇔ ahead` (SC-001). Seen to fail.
- [X] T018 [US1] Create `src/workflow/compass.ts` — pure `computeVerdict(doc, currentPhase, intentPhase, hasNode, sideState) → Verdict` over `derivePhase` + the doc's ordered phase ordinals (R1). GREEN T017.
- [X] T019 [P] [US1] RED: `src/__tests__/workflow/compass-cli.test.ts` — exit codes (on-course/behind → 0; ahead → non-zero; off-rail → non-zero; unknown intent → 2); read-only/determinism (identical output + clean tree on re-run); `--json` shape (contracts/compass-cli.md). Seen to fail.
- [X] T020 [US1] Add the `compass` subaction to `src/subcommands/workflow.ts` — orientation mode (no `--intent`) + intent-diff mode; reuse the existing `resolve`/`failUsage`/exit conventions; emit `--json`. GREEN T019.
- [X] T021 [US1] Off-rail orphan detection: an item with no roadmap node (orphan spec dir) → `off-rail` naming the missing node, wired through `resolveIdentity` / the derivation context (acceptance US1.3).

**Checkpoint**: the compass is a usable orientation + diff primitive (MVP), independent of any skill embedding.

---

## Phase 6: User Story 2 — Every lifecycle skill refuses an off-rail action (FR-006/FR-007)

**Goal**: each lifecycle skill opens by consulting the compass and refuses loud on a non-zero
verdict — an agent following its skills cannot skip a step.

**Independent Test**: driving a lifecycle skill on an `ahead`/`off-rail` item refuses loud
(names the missing prior step) and performs none of its work; an `on-course` item proceeds.

- [X] T022 [P] [US2] RED: `src/__tests__/lifecycle-precondition.test.ts` — `checkLifecyclePrecondition({item,intent})`: ahead/off-rail → `proceed:false` with the reason + skipped step; on-course/behind → `proceed:true`; no resolvable item → fail loud (contracts/skill-precondition.md). Seen to fail.
- [X] T023 [US2] Create `src/lifecycle-precondition.ts` — resolve item → compute compass verdict → `{ proceed, verdict }` with the single canonical refusal-message shape. GREEN T022.
- [X] T024 [US2] Embed the compass-precondition opening step in `skills/define/SKILL.md` (run `workflow compass <item> --intent define`; non-zero ⇒ hard refusal, perform no work).
- [X] T025 [P] [US2] Embed the precondition in `skills/design/SKILL.md` (`--intent design`).
- [X] T026 [P] [US2] Embed the precondition in `skills/execute/SKILL.md` (`--intent execute`).
- [X] T027 [P] [US2] Embed the precondition in `skills/release/SKILL.md` (`--intent release`).
- [X] T028 [P] [US2] Embed the precondition in `skills/session-end/SKILL.md` (`--intent session-end`).
- [X] T029 [US2] Embed the precondition at the `after_implement` govern surface — the `govern` opening in `src/subcommands/govern.ts` (and/or the `execute` skill's govern step) consults the compass with `--intent govern` before assembling the payload.

**Checkpoint**: the compass is the enforcement surface; off-rail actions are refused at every lifecycle skill.

---

## Phase 7: User Story 3 — Capture fused to authoring; orphans impossible through the front door (FR-008/FR-009)

**Goal**: authoring a spec creates its roadmap node in the same move; an orphan spec dir is a
hard error reported by the compass and every spec-resolving verb.

**Independent Test**: authoring through the front door yields a spec dir AND a node at a
consistent phase; a hand-created orphan spec dir is a hard error everywhere it is resolved.

- [X] T030 [P] [US3] RED: `src/__tests__/capture-fusion.test.ts` — authoring through the supported path creates a referencing roadmap node in the same operation (FR-008); a spec dir with no node is a hard error for every spec-resolving verb (FR-009) and `off-rail` from the compass (SC-003). Seen to fail.
- [X] T031 [US3] Fuse node creation into the authoring front door — the `define` / `speckit-specify` path creates the roadmap node (derived from the canonical identity) atomically with the spec dir; no spec dir producible without a node. GREEN the FR-008 half of T030. (Realized in `skills/define/SKILL.md` body + any supporting verb; no orphan-producing path remains.)
- [X] T032 [US3] Orphan = hard error: spec-resolving verbs raise a hard error (not a passive reconcile note) on a spec dir with no node, and the compass returns `off-rail`. GREEN the FR-009 half of T030.

**Checkpoint**: the 023-class orphan is unreachable through the supported path.

---

## Phase 8: User Story 5 — Gates are refusals, not reports (FR-010 phased retirement)

**Goal**: retire report-only where this feature enforces — the entry gate and the back-half
`governing → shipped` gate refuse on an unmet gate; mid-pipeline stays advisory in the engine's
advance path during migration.

**Independent Test**: an enforced transition with an unmet exit gate refuses loud (not merely
prints the unmet criteria); a met gate proceeds.

- [X] T033 [P] [US5] RED: `src/__tests__/workflow/compass-cli.test.ts` (or a focused advance test) — a `governing → shipped` advance with an unmet exit gate refuses loud (non-zero), naming the unmet criteria; the entry gate refuses an orphan; a met gate proceeds (US5.1/US5.2). Seen to fail.
- [X] T034 [US5] Enforce the two gates as refusals in `src/subcommands/workflow.ts` `emitAdvance` (and/or `src/workflow/transition-engine.ts`): the `governing → shipped` transition and the entry gate refuse on unmet criteria; mid-pipeline transitions remain advisory (retire the blanket FR-010 report-only comment ONLY for the enforced gates). GREEN T033.

**Checkpoint**: the back half has teeth; report-only is retired where enforcement applies.

---

## Phase 9: Polish & Cross-Cutting

- [X] T035 [P] FR-014 honest-boundary documentation: record in `README.md` / the relevant SKILL.md that enforcement binds the agent (which follows its skills), not a human with raw `git`/`gh`. Do not overclaim.
- [X] T036 [P] Line-cap audit (Principle VI): confirm the FR-012 fix did not push `src/govern/incremental-audit.ts` or `src/govern/payload-implement.ts` past 300–500 lines (TASK-48 already flags payload-implement); refactor the touched module if it crossed.
- [X] T037 Run the full `npm test` (Vitest) suite green + walk `quickstart.md` scenarios 1–5 (scenario 6 is post-release per the closure rule).
- [X] T038 [P] Update the workflow surface docs (the `workflow` verb help / any README workflow section) to document the new `compass` subaction + its exit codes.

---

## Dependencies & Execution Order

### Phase dependencies (FR-015 order)

- **Setup (P1)** → no deps.
- **Foundational (P2, identity)** → after Setup. BLOCKS US4 + US1 (govern + compass route through `resolveIdentity`; compass derivation reads the re-keyed convergence record).
- **US4 (P3, govern runnable)** → after Foundational. Leads per FR-015 (the back-half gate's enforceability depends on it).
- **US6 (P4, identity acceptance)** → after Foundational + US4 (close-related/govern agreement).
- **US1 (P5, compass)** → after Foundational. The MVP primitive.
- **US2 (P6, embedding)** → after US1 (skills call the compass verb).
- **US3 (P7, capture fusion)** → after US1 + US2 (orphan → off-rail; define embeds the precondition).
- **US5 (P8, gates refuse)** → after US4 (govern runnable) + US1 (verdict). Retires FR-010 on the enforced gates.
- **Polish (P9)** → after all desired stories.

### Within each story

- The RED test is written and seen to fail before its GREEN implementation (Principle I).
- Types (Setup) before everything; identity resolver before govern/compass; vocab before compass verdict; verdict before CLI; CLI before skill embedding.

### Parallel opportunities

- T002/T004 are the same test file → sequential; T006/T007 share `govern-resolution.test.ts` → write together, both RED before T008/T009.
- T015/T017/T019 are distinct test files → [P].
- T024–T028 are distinct SKILL.md files → [P] (T029 touches govern.ts → sequence after T023).
- T035/T036/T038 are distinct files → [P].

---

## Implementation Strategy

### MVP

Per FR-015 the *enabling* MVP is **Foundational + US4 + US1**: a runnable govern on the
session-pinned branch, one canonical identity, and a working compass primitive. At that point
an agent can self-orient and catch its own skips even before the skills embed it.

### Incremental delivery

1. Setup + Foundational → identity unified, convergence un-collided.
2. US4 → govern runnable on the session-pinned branch (unblocks the back-half gate).
3. US6 → identity acceptance closed (close-related agreement, collision test).
4. US1 → compass primitive (orient + diff + exit code) — MVP usable standalone.
5. US2 → every lifecycle skill refuses off-rail (the enforcement surface).
6. US3 → capture fused; orphans impossible through the front door.
7. US5 → the two enforced gates refuse; FR-010 retired where it applies.
8. Polish → honest-boundary docs, line-cap audit, quickstart walk, full suite green.

### Notes

- Commit after each task or logical RED→GREEN pair; push (Principle VII / project rule).
- Closure (SC-006) is verified post-release in a formally-installed plugin — the agent posts
  evidence; the operator decides closure.

---

## Phase 10: Post-implementation barrage findings (cross-family frontier, 2026-06-16)

The whole-feature cross-family barrage (codex/gpt-5.5 + claude/opus) surfaced findings on the
024 implementation. The HIGH (cross-family) + the cheap precise MEDIUMs were fixed in-session
(see commits); the two MEDIUMs below are scoped here as TDD-first fix-tasks (per the
scope-don't-defer discipline). Both are real but lower-priority and the default bundled
WORKFLOW.md works today — they harden the adopter-customized case.

- [ ] T039 [US5/US1] RED→GREEN: eliminate the array-position phase-ordering assumption in BOTH the advance gate AND the compass verdict (AUDIT-BARRAGE claude-02 + claude-03 — SAME root). (1) `emitAdvance` resolves the enforced back-half gate by the SEMANTIC `governing → shipped` transition (graduate codename / a terminal-in-linear-pipeline flag), NOT `r.doc.phases[length-1]`. (2) `compass.ts` `ordinal()`/verdict comparison derives order from a validated linear-pipeline projection (excluding side-states) / the `phase.next` chain, NOT `findIndex` array position — else an adopter WORKFLOW.md with a reordered terminal phase or a side-state among `phases` misclassifies `ahead`/`behind` (verdict) or enforces the wrong transition (gate). One shared ordering helper covers both. Files: `src/subcommands/workflow.ts` + `src/workflow/compass.ts` + fixtures in `advance-gate-enforcement.test.ts` / `compass.test.ts`.
- [ ] T040 [US1/US5] **(HIGH — carries codex-01 round 3)** RED→GREEN: the compass VERDICT must reflect the exit GATE, not just phase ordinals. (1) codex-01 (HIGH): `release`/`ship` map to `shipped` and `computeVerdict` compares only ordinals, so from `governing` the verdict is `on-course` even when the `governing → shipped` exit gate (`record-converged impl`) is UNMET — an agent gating `/stack-control:release` on the compass would proceed without convergence. A graduation/transition intent's `on-course` MUST require the transition exit gate met (else surface the unmet gate). (2) claude-05 (round 2): single-source the orientation report (`p.exit`) and the advance enforcement (`t.exitGate`) from ONE gate definition so they cannot diverge under adopter customization. Mitigation today: the actual graduate transition still refuses without convergence (US5 `emitAdvance`), and `/release` is an operator-hard-gated procedure — so this is "compass says go but the real gate still holds," not an actual un-governed graduation; still a real orientation/enforcement inconsistency to close. Files: `src/workflow/compass.ts` (verdict gate-eval for graduation intents) + `src/subcommands/workflow.ts` (orientation + advance single-source) + tests in `compass.test.ts` / `advance-gate-enforcement.test.ts`.

> Also scoped to `multi:feature/unskippable-workflow-protocol` (not this spec): wiring the
> `after_implement` hook / `execute` to pass `--item` to govern (codex-01 remainder — the
> authoritative item path now EXISTS via `--item`; the hook does not yet supply it), and a
> recorded session-end compass warning (codex-03 remainder).
- [ ] T041 RED→GREEN: govern must REFUSE (non-zero, gate-closed terminal) when a WORKFLOW-driven govern cannot write the canonical convergence record (an orphan with no roadmap node) — not print "governed" + exit 0 (AUDIT-BARRAGE codex-03, HIGH). It must DISTINGUISH that from a legitimate STANDALONE govern with no workflow node (the current govern-loop-driver / govern-terminal-outcomes / govern-phase-unit fixtures govern node-less features and expect graduation) — so those must gain a roadmap node referencing the feature dir, OR govern must gate the refusal on a workflow context being present (e.g. `--item`/marker resolved a node). Mitigation today: the workflow gate reads the convergence record, so an absent record means the feature cannot advance to `shipped` regardless of the exit code — i.e. the bug is a misleading exit code, not an actual un-governed graduation; and model-(b) capture-fusion makes an in-workflow orphan unreachable through the front door. Files: `src/subcommands/govern.ts` (convergence-write block) + the 3 govern fixtures + `feature-resolution.ts`.
