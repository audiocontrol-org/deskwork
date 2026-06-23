# Implementation Plan: Transitive item closure + the post-ship terminal stage

**Branch**: `feature/stack-control` (long-lived program branch; spec dir `031-transitive-item-closure`) | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/031-transitive-item-closure/spec.md`

**Design record**: [`docs/superpowers/specs/2026-06-23-transitive-item-closure-design.md`](../../docs/superpowers/specs/2026-06-23-transitive-item-closure-design.md) (operator-approved 2026-06-23; architecture is settled there). Clarifications resolved in spec § Clarifications (Session 2026-06-23).

## Summary

Give a roadmap item's terminal end its real post-ship shape and make "closing what an item contains" one mechanical move. Three deliverables: (1) a **transitive closer** — `close-related --cascade` walks an item's `part-of` subtree, closes each node's recorded `closes:` backlog ids, dedups multi-parent via a visited-`Set`, **skips-and-reports** non-terminal children, and applies **uniform terminal handling** to `cancelled`/`retired` members; (2) a **`closes:` population path** — a new `roadmap resolves <node> --add/--remove TASK-…` verb plus auto-back-link on `backlog done`/`promote` via a new optional task→parent-node ref — so the closer has an auditable recorded set to act on without hand-edits; (3) a **post-ship terminal stage** — a new terminal phase `closed` (and matching roadmap status `closed`) after `shipped`, entered only via the operator-confirmed **`advance --to closed`** move (dry-run cascade → explicit `--apply`), with phase-derivation mapping status→phase by name so `shipped` is no longer treated as terminal and the lifecycle surfaces the pending `closed`. Closure never fires automatically and no install/validation criterion is baked into any stage (install-agnostic), which dissolves the offing audit/publish deadlock by construction.

## Technical Context

**Language/Version**: TypeScript (strict — no `any`, no `as Type`, no `@ts-ignore`), run via `tsx`; Node ESM with the package's `@/` import conventions.

**Primary Dependencies**: existing in-tree modules — `src/subcommands/roadmap.ts` (`emitCloseRelated`, advance), `src/subcommands/backlog.ts` (`emitDone`, `emitPromote`), `src/roadmap/roadmap-model.ts` (WorkItem, `closes`/`partOf` parsing, terminal-status set), `src/roadmap/graph.ts` (`blocks()` reverse-edge pattern), `src/roadmap/edge-mutations.ts` / `mutations.ts` (`advance`), `src/backlog/backend.ts` (`close()`), `src/workflow/phase-derivation.ts` (`derivePhase`), `src/workflow/compass.ts` (`computeVerdict`), `templates/WORKFLOW.md`, `grammars/roadmap.peg` (status vocabulary + `closes` prose-field), `src/document-model/edges.ts`. **No new runtime dependency** — the cascade, the reverse-edge walk, and the `closes:` mutation are in-tree TypeScript over the existing governed-markdown engine.

**Storage**: installation-anchored governed markdown + backlog store under `.stack-control/` (FR-010 installation-anchor invariant): `ROADMAP.md` (nodes, `closes:`, `status`), the `backlog` task store (status + the new parent-node ref), `WORKFLOW.md` (the new `closed` phase). No new artifact kinds beyond fields on existing ones.

**Testing**: vitest. Test-first per Principle I — every FR gets a RED test watched to fail for the expected reason before implementation. On-disk fixture roadmaps + backlog stores (never mock the filesystem, per `.claude/rules/testing.md`); the cascade walk, `childrenOf`, skip-and-report, dedup, and uniform-terminal handling are pure functions tested directly; the verbs are exercised end-to-end against fixtures.

**Target Platform**: Node CLI (`stackctl`); vendor-neutral core. No Claude-Code-only surface — every verb runs to completion in a plain shell.

**Project Type**: CLI engine (single project — `src/` + co-located `__tests__/`).

**Performance Goals**: roadmap-scale (the program roadmap is ~50 nodes; `part-of` subtrees are small). The cascade is a single bounded DFS/BFS over the subtree with a visited-`Set`; closure cost is linear in the recorded `closes:` ids reached. No new fan-out.

**Constraints**: every touched/new source file ≤ 500 lines (Principle VI) — the cascade lands in a new focused module rather than bloating `roadmap.ts`. No fallbacks / fail-loud (Principle V) — an unknown `closes:` id surfaces in dry-run before any apply; closure never auto-fires; absence of a parent-node ref is a no-op, not a fabricated link. Auditable recorded-set preserved (023 FR-003) — the closer only touches ids recorded in `closes:`/`ref:`, never inferred. Install-agnostic (FR-017) — no stage criterion assumes an artifact exists.

**Scale/Scope**: a single roadmap graph + one backlog store per installation. The change is confined to `plugins/stack-control/`; no cross-plugin coupling.

### Unknowns / NEEDS CLARIFICATION

The three scope forks were resolved in `/speckit-clarify` (spec § Clarifications). The residuals carried to research are precision/tuning, not direction:

- **OQ-3 (parent-node ref shape)**: the exact field name + storage of the optional task→parent-node ref, whether `promote` sets it as part of recording promotion linkage, whether `capture` accepts it, and where `done` reads it for the auto-back-link. *Direction settled* (a single optional scalar node-id ref); only the storage detail is open. Resolved in research.
- **OQ-4 (which skill surfaces the close)**: `advance --to closed` is the verb (settled, FR-016); whether the operator-facing surface that drives it is a `/stack-control:release` tail, a new `/stack-control:close` skill, or an existing hygiene skill is a skill-wiring detail resolved in research / at `tasks`. Per `enforcement-lives-in-skills.md` the firing surface is a skill body + the verb, never a git hook.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

All 9 principles evaluated. **Verdict: PASS (no deviations).**

| # | Principle | Verdict | How this feature satisfies it |
|---|-----------|---------|-------------------------------|
| I | Test-First (NON-NEGOTIABLE) | PASS | Every FR (FR-001..FR-018) gets a RED test first. The cascade walk, `childrenOf`, dedup, skip-and-report, and uniform-terminal handling are pure functions tested in isolation; the `closed` phase/status, phase-derivation-by-name, compass rules, and the verbs are exercised against on-disk fixtures. No "for now" code. |
| II | Integration-First, No Speculative Building | PASS | Built from the **concrete instance** already in hand — the `govern-030-hardening` umbrella whose 16 ids were hand-closed — not an imagined provider. No scope cuts inserted; the spec's residual open questions stay marked (OQ-3/OQ-4), never silently dropped (capture-over-YAGNI). The closer reuses the existing `close-related` + `backend.close()` machinery rather than reinventing closure. |
| III | Branch on Capabilities, Never Provider Identity | PASS | No vendor branching introduced. The closer and verbs operate on governed markdown + the backlog backend interface; the operator-confirm is a CLI dry-run/`--apply`, not a host-specific surface. |
| IV | Division of Labor | PASS | The closer reads roadmap/backlog state and writes only stack-control-owned state (node `status`, `closes:`, backlog task status + parent-node ref) under the installation anchor. It never writes governance state into a provider artifact. |
| V | No Fallbacks, No Mock Data Outside Tests | PASS | An unknown `closes:` id fails loud in dry-run before any apply (consistent with today's `close-related`). Closure never auto-fires — `advance --to closed` requires explicit `--apply`. A missing parent-node ref is a documented no-op, never a fabricated back-link. A non-terminal child is reported, never silently closed. |
| VI | Strict Typing & Composition | PASS | New work is composition-first with interface-typed boundaries; no `any`/`as`/`@ts-ignore`. The cascade lands in a new `transitive-close.ts` (+ `childrenOf` in `graph.ts`) rather than growing `roadmap.ts` past the cap; every new/changed file ≤ 500 lines (asserted by SC-derived test). |
| VII | Commit & Push Early and Often | PASS | One logical change per task, pushed at each task boundary; no AI attribution. |
| VIII | Faithful Tool Adoption | PASS | Authored at the `plan` step of the Spec Kit chain (constitution → specify → clarify → plan → checklist → tasks → analyze → implement); no step skipped. Adds a phase to the governed lifecycle without removing a Spec Kit step. |
| IX | Execution-Backend Pluggability (capability, not vendor) | PASS | No execution-backend coupling introduced; the feature is engine-side roadmap/backlog/workflow logic. The operator-confirm surface (OQ-4) is a skill body + CLI verb, host-agnostic. |

No entry in Complexity Tracking — there are no justified deviations.

## Project Structure

### Documentation (this feature)

```text
specs/031-transitive-item-closure/
├── plan.md              # This file
├── research.md          # Phase 0 output — OQ-3/OQ-4 + reuse decisions
├── data-model.md        # Phase 1 output — entities, fields, lifecycle
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output — observable-interface contracts
│   ├── close-cascade.md       # close-related --cascade + advance --to closed
│   ├── roadmap-resolves.md    # the resolves verb (populate closes:)
│   ├── backlog-parent-node.md # task parent-node ref + auto-back-link
│   └── terminal-stage.md      # closed phase/status, derivation-by-name, compass
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root: `plugins/stack-control/`)

**New / changed modules** (each responsibility one-line-statable; all ≤ 500 lines):

```text
src/roadmap/
├── graph.ts                  # CHANGED — add childrenOf(model, parentId) reverse part-of helper (mirrors blocks())
├── transitive-close.ts       # NEW — cascade walk: part-of subtree DFS, visited-Set dedup, skip-and-report
│                             #   non-terminal, uniform terminal handling; returns a CascadePlan (pure)
├── closes-mutation.ts        # NEW — add/remove ids in a node's prose closes: set (add-edge refuses prose)
├── roadmap-model.ts          # CHANGED — admit `closed` into the terminal-status set (+ derive from grammar)
└── mutations.ts              # CHANGED — advance --to closed runs the cascade as its effect (dry-run/--apply)

src/subcommands/
├── roadmap.ts                # CHANGED — close-related --cascade flag; new `resolves` verb; advance closed wiring
└── backlog.ts                # CHANGED — capture/promote accept + set the parent-node ref; done back-links

src/backlog/
└── backend.ts                # CHANGED — persist + read the optional parent-node ref on a task

src/workflow/
├── phase-derivation.ts       # CHANGED — map status→phase BY NAME; retire shipped→last special-case; add closed
└── compass.ts                # CHANGED — shipped→closed legitimate; refuse closed from non-shipped

grammars/
└── roadmap.peg               # CHANGED — add `closed` to the status vocabulary / terminal set

templates/
└── WORKFLOW.md               # CHANGED — add phase:closed after phase:shipped + the shipped→closed transition

src/**/__tests__/             # NEW — RED-first tests per FR (co-located)
```

**Structure Decision**: Single-project CLI engine; all work under `plugins/stack-control/src/` (+ `grammars/`, `templates/`). The cascade is isolated in `transitive-close.ts` and the `closes:` mutation in `closes-mutation.ts` to keep `roadmap.ts` under the cap and the new logic unit-testable in isolation. No clean-break deletions beyond retiring the `status === shipped → last-phase` special-case in `phase-derivation.ts` (replaced by status→phase-by-name; the old branch is deleted, not kept as a fallback — per the zero-back-compat rule).

## Complexity Tracking

No violations. No justified deviations.

## Phase 0: Research

See [research.md](./research.md). Resolves: the parent-node ref field shape + where `promote`/`capture`/`done` read/write it (OQ-3); the operator-facing close surface — release tail vs new `/stack-control:close` skill (OQ-4); the `closes:` prose-set mutation approach (why not `add-edge`); the status→phase-by-name derivation rework + the `closed` grammar/vocabulary addition; uniform-terminal vs skip-and-report walk semantics and their closure-reason strings; reuse of `backend.close()` for idempotent closing. Each decision traces to the design record / spec FRs / clarifications. Tensions between design and spec (if any) recorded under "Tensions surfaced."

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md) (WorkItem `+closed` status `+closes` set, BacklogTask `+parentNode` ref, Phase `+closed`, the CascadePlan dry-run artifact, the reverse-edge children relation), [contracts/](./contracts/) (`close-cascade`, `roadmap-resolves`, `backlog-parent-node`, `terminal-stage`), and [quickstart.md](./quickstart.md) (runnable validation scenarios mapped to SC-001..SC-007 and US1..US4). Re-run the Constitution Check after design: no new violations expected (the module list is authored to the ≤500-line cap and introduces no vendor branching or fallback).
