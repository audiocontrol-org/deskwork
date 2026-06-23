# Implementation Plan: ship-stage

**Branch**: `032-ship-stage` (spec dir; one long-lived branch, no per-feature branch) | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/032-ship-stage/spec.md`; approved design record `docs/superpowers/specs/2026-06-23-ship-stage-design.md`.

## Summary

Make recording `status: shipped` non-optional by welding it to the merge. Add a `/stack-control:ship` skill that is the one on-rail ship step (govern-converged precondition → open PR → operator confirms CI green → merge → non-discretionarily fire `graduate`). Restructure the governed lifecycle so the post-govern span reads `governing → merging → validating → closed` (`shipped` is the recorded STATUS, set by `graduate` at merge; `validating` is the post-merge phase derived from `status: shipped`), with every post-merge phase derived from the **recorded `status:`** (+ the `validated` marker as the close gate) — the same source the close gate reads — eliminating the TASK-445 divergence by construction. Add a **backstop compass invariant** that refuses forward lifecycle motion while a merged-but-status-in-flight item exists (detected by a portable git signal: the item's govern convergence record reachable from `origin/main` while status ≠ shipped), with session-start/session-end surfacing it as a non-blocking advisory only. Add an adopter-defined `validating` phase (default: operator-confirm `validated` marker). Delivered as ONE unit.

## Technical Context

**Language/Version**: TypeScript (strict), run via `tsx`; in-tree under `plugins/stack-control/src/`.

**Primary Dependencies**: the governed `WORKFLOW.md` engine (022 — `workflow-grammar.ts`, `gate-eval.ts`, `phase-derivation.ts`, `effects.ts`, `transition-engine.ts`); the compass (024 — `compass.ts`, `compass-resolve.ts`); the convergence-record store (`src/govern/convergence-record.ts`); the git helper (`src/session/git.ts`); the roadmap model + mutations (006); skills under `skills/`.

**Storage**: governed markdown (`templates/WORKFLOW.md`, `ROADMAP.md`), JSON convergence records under `.stack-control/govern/convergence/<mode>__<item>.json`, the local journal. No DB.

**Testing**: Vitest (`src/__tests__/`); fixture installations on disk; RED-first (Constitution Principle I).

**Target Platform**: Claude Code / Codex in-session agent + a plain shell (`stackctl` is the vendor-neutral core).

**Project Type**: Single in-tree TypeScript plugin (CLI + skills).

**Performance Goals**: N/A (interactive lifecycle verbs).

**Constraints**: files ≤ 500 lines (`workflow.ts` is at 433 — a split point); no `any`/`as`/`@ts-ignore`; `@/` imports; the on-rail ship weld MUST NOT require a GitHub remote to record `status: shipped` (FR-013); the off-rail backstop merge-detection uses a git remote ref (no gh-API); enforcement lives in skill bodies + CLI verbs, never git hooks; installation-anchor invariant for any state write.

**Scale/Scope**: the roadmap is ~50 nodes; one long-lived branch with sequential PRs (relevant to FR-012 merge-detection).

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after design below.*

- **I. Test-First (NON-NEGOTIABLE)** — PASS (plan mandates RED-first for every new phase/transition/criterion/derive-kind/skill; tasks.md will order tests before impl).
- **II. Integration-First, capture-don't-cut** — PASS (the spec captured all surfaces incl. the honest-boundary + one-unit constraint; no scope cuts; the feature extends two concrete prior instances — 031's closed stage + 025's compass-enforcement).
- **III / IX. Capability, not vendor** — PASS (the merge step uses the operator + git/PR host generically; the backstop keys on a git ref, not a vendor API; no branch on vendor identity; the on-rail weld has no gh-API dependency).
- **IV. Division of labor** — PASS (the engine records progress: `status: shipped`, the `validated` marker, phase derivation; it never writes into a provider artifact).
- **V. No fallbacks / fail-loud** — PASS (ship refuses loud when not govern-converged or when the operator does not confirm CI green; the backstop refuses loud and names the dangling item; no silent skip).
- **VI. Strict typing & composition** — PASS (new derive/criterion kinds are typed enum members; `workflow.ts` split keeps files ≤ 500).
- **VII. Commit & push early/often** — PASS (per-phase commits + pushes; one logical change per commit).
- **VIII. Faithful tool adoption** — PASS (this plan is produced inside the faithful Spec Kit chain; no step skipped).
- **Installation-anchor invariant** — PASS (all writes — `status`, `validated` marker, journal, commit — anchor in the enclosing installation; the backstop reads `origin/main` read-only).
- **Enforcement-lives-in-skills** — PASS (the backstop is a compass invariant + CLI verb; the ship discipline is the skill body + `graduate` effect; never a git hook).

No violations → Complexity Tracking omitted.

## Project Structure

### Documentation (this feature)

```text
specs/032-ship-stage/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (merge-detection, CI-gating, phase/derive mechanism, backstop placement)
├── data-model.md        # Phase 1 — phases, transitions, criterion/derive kinds, validated marker, merge signal, backstop invariant
├── quickstart.md        # Phase 1 — runnable validation scenarios mapped to SC-001..SC-007
├── contracts/
│   ├── workflow-grammar-changes.md   # WORKFLOW.md phase/transition/criterion/derive additions
│   ├── ship-skill.md                 # /stack-control:ship interface contract
│   └── backstop-compass-invariant.md # the merged-but-status-in-flight compass invariant + git signal
└── checklists/requirements.md        # (from specify; all items pass)
```

### Source Code (installation root: `plugins/stack-control/`)

```text
templates/WORKFLOW.md                 # add merging + validating phases; DELETE phase:shipped; rewire transition:graduate (merging→validating, records status:shipped)
src/workflow/
├── workflow-types.ts                 # + CRITERION_KINDS / DERIVE_KINDS members (status-is / validated marker)
├── workflow-grammar.ts               # parse the new kinds
├── phase-derivation.ts               # shipped/validating predicate derivation over recorded status + validated marker
├── gate-eval.ts                      # evaluate the new criterion(s) (validated marker; merged gate on graduate)
├── compass.ts                        # backstop verdict: refuse on any merged-but-status-in-flight item
├── compass-resolve.ts               # feed the backstop the git merge signal
├── effects.ts / transition-engine.ts # graduate fires at merge (effect order unchanged: commit last)
├── merge-signal.ts                   # NEW — git: convergence record reachable from origin/main + status≠shipped
└── workflow.ts                       # SPLIT (433→ ) — extract a module to stay ≤500 when adding ship/backstop wiring
src/session/
├── git.ts                            # + helper: is-ancestor-of-base / reachable-from-base
├── orient.ts / session-end.ts        # + non-blocking merged-but-status-in-flight advisory
skills/ship/SKILL.md                  # NEW — the on-rail ship step (modeled on skills/close + skills/execute)
src/subcommands/                      # ship CLI wiring if any verb backs the skill (e.g. `workflow ship` / reuse advance)
src/__tests__/workflow/               # RED-first: merging/validating derivation, graduate-at-merge gate, backstop, advisory
```

**Structure Decision**: extend the existing 022/024/031 engine in place (no new package). Split `workflow.ts` (at 433) before adding the ship/backstop wiring. The backstop lives in `compass.ts`/`compass-resolve.ts` + a new `merge-signal.ts` (cross-item invariant), NOT as a per-item WORKFLOW.md criterion.

## Phase 0 → research.md; Phase 1 → data-model.md, contracts/, quickstart.md, agent-context update. See those artifacts.
