# Implementation Plan: Parseable lifecycle workflow engine

**Branch**: `feature/stack-control` (session-pinned) | **Date**: 2026-06-16 | **Spec**: `specs/022-parseable-lifecycle-workflow/spec.md`

**Input**: Feature specification from `specs/022-parseable-lifecycle-workflow/spec.md`

## Summary

Build a `workflow` verb family that drives roadmap items deterministically through gated lifecycle phases. An item's phase is **derived** from artifacts that already exist; every stage gate is a **mechanical true/false predicate** published in one **governed `WORKFLOW.md`** (a plugin-bundled default, per-install overridable); advancing fires a **fixed, atomic effect manifest** (commit-last boundary, git rollback) with zero agent discretion. The feature consumes the existing `roadmap` node-reader, reuses the `document-model` grammar engine (third document-primitives use), and extends the `govern` checkpoint / convergence machinery. It introduces the `designing` phase and `/stack-control:design` (an opinionated frontend over a swappable, capability-selected backend), and pulls in the on-disk govern-convergence record (TASK-19) so both `specifying → implementing` and `governing → shipped` are mechanical.

## Technical Context

**Language/Version**: TypeScript strict mode on Node.js, executed via `tsx`.

**Primary Dependencies**: existing stack-control modules — `src/roadmap/` (node-reader: `roadmap-model.ts`, `graph.ts`, `views.ts`), `src/document-model/` (`grammar-resolver.ts`, `grammar-parse.ts` — the governed-doc grammar engine), `src/govern/` (`checkpoint-state.ts`, `convergence-*.ts` — staleness + convergence), `src/config/` (installation-anchor resolution); Vitest.

**Storage**: on-disk markdown / YAML under the installation — the bundled `WORKFLOW.md` default (+ optional `.stack-control/` or project override), roadmap node fields (`design:`, `spec:`, `design-approved:`), and the mode-keyed govern-convergence records.

**Testing**: Vitest unit + integration + fixture CLI runs, plus an adopter-repo installation-isolation probe (mirrors `installation-isolation-probe.test.ts`) and atomicity fault-injection tests.

**Target Platform**: local CLI execution in stack-control installations on macOS / Linux (Claude Code and Codex hosts; no headless/batch dependency).

**Project Type**: plugin CLI / control-plane workflow layer.

**Performance Goals**: query verbs (`status`/`can-enter`/`next`) are read-only and side-effect-free; `advance --apply` is atomic with a single trailing commit; phase derivation is a pure function with no network or model calls.

**Constraints**: no fallbacks (fail loud); every authored artifact anchored in the nearest-enclosing installation; no branch on backend vendor identity (capability only); new/touched source files under the 300–500-line cap.

**Scale/Scope**: a roadmap with up to a few hundred nodes; one governed `WORKFLOW.md`; small-to-medium effect manifests per transition.

## Constitution Check

- **I. Test-First (NON-NEGOTIABLE)**: PASS. Every story lands RED→GREEN — derivation, gate evaluation, atomic advance (fault-injection), the design-to-spec exit gate, and the isolation probe are all test-first.
- **II. Integration-First, No Speculative Building**: PASS. The grammar engine, roadmap node-reader, and govern checkpoint machinery are concrete existing instances the feature composes; no abstraction is designed ahead of a real instance. Capture-everything honored (the spec carries the thin areas as open questions, not cuts).
- **III. Branch on Capabilities, Never Provider Identity**: PASS. The design backend is selected by capability; no vendor branch.
- **IV. Division of Labor**: PASS. Providers own authoring intent (the design backend writes the design record; Spec Kit authors the spec); the workflow owns physical substrate + progress (phase derivation, gates, effects). Projection is one-way.
- **V. No Fallbacks, No Mock Data Outside Tests**: PASS. Malformed `WORKFLOW.md`, a missing installation, a dirty advance tree, and a missing convergence record all fail loud.
- **VI. Strict Typing & Composition**: PASS. New `src/workflow/` modules are focused and composed (derivation / gate-eval / effect-engine / grammar-binding kept separate); no monolith; files under cap.
- **VII. Commit & Push Early and Often**: PASS. One logical change per commit, pushed at task boundaries.
- **VIII. Faithful Tool Adoption**: PASS. This is the `/speckit-plan` output for 022, produced in the prescribed chain order (specify → clarify → plan).
- **IX. Execution-Backend Pluggability (capability, not vendor)**: PASS. The design frontend/backend seam is Principle III applied to the design stage; the backend contract is capability-declared and the default is swappable.

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/022-parseable-lifecycle-workflow/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
├── contracts/
│   ├── workflow-cli.md            # status / can-enter / next / advance / link-design / link-spec
│   ├── workflow-md-grammar.md     # the governed WORKFLOW.md grammar (phase + transition units)
│   ├── phase-derivation.md        # the derive function: observed artifacts → phase
│   └── govern-convergence-record.md  # the mode-keyed convergence record (spec + impl; TASK-19)
└── tasks.md                       # /speckit-tasks output (not created here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/
│   ├── workflow/                  # NEW module
│   │   ├── workflow-grammar.ts        # WORKFLOW.md grammar binding (via document-model)
│   │   ├── phase-derivation.ts        # pure function: artifacts → current phase
│   │   ├── gate-eval.ts               # criterion predicates → true/false + unmet enumeration
│   │   ├── transition-engine.ts       # effect-manifest assembly + atomic apply (commit-last)
│   │   ├── effects.ts                  # the fixed 7-verb effect vocabulary dispatch
│   │   └── house-rules.ts             # the design frontend's single-source opinion block
│   ├── subcommands/
│   │   └── workflow.ts                # NEW CLI dispatch: status|can-enter|next|advance|link-design|link-spec
│   ├── roadmap/                   # consumed (node-reader); + new node fields design:/design-approved:
│   ├── document-model/            # reused (grammar engine) for WORKFLOW.md
│   ├── govern/                    # extended: mode-keyed govern-convergence record (TASK-19)
│   └── __tests__/workflow/        # derivation / gates / atomic-advance / isolation-probe / design-gate
├── templates/
│   └── WORKFLOW.md                # NEW bundled default lifecycle (override-resolvable)
└── skills/
    └── design/SKILL.md            # NEW /stack-control:design frontend over swappable backend
```

**Structure Decision**: keep workflow logic in a new `src/workflow/` module and the CLI dispatch in `src/subcommands/workflow.ts`, mirroring how `roadmap` / `govern` separate engine from dispatch (ratified decision 1: a new family that *consumes* the roadmap node-reader, not an extension of the roadmap reasoner). The bundled `WORKFLOW.md` lives in `templates/` and resolves through the existing override stack (clarified: bundled default, per-install overridable). Govern-convergence recording extends `src/govern/` rather than forking it.

## Complexity Tracking

No constitution violations. The main complexity risk is that derivation, gates, and the effect engine all read the same governed doc and node surface; the mitigation is to keep each concern in its own `src/workflow/` module behind the contracts in `contracts/`, exactly as the spec's key entities are separated.
