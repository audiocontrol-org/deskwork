# Implementation Plan: Backlog → Feature-Rigor Promotion Seam

**Branch**: `feature/stack-control` (program single-branch) | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-backlog-promotion-seam/spec.md`

## Summary

Add a `stackctl backlog promote` subaction that graduates a backlog item into the feature-rigor tier by **recording a linkage** (record-don't-create, mirroring the inbox `promote` contract). Three graduation targets — a new Spec Kit feature spec, a task inside an existing feature's `tasks.md`, and a roadmap node — selected per the item's nature. Single-item and batch (N items → one feature's `tasks.md`) granularity. The verb writes a machine-greppable backlink bullet + a `promoted` marker on the backlog item, never creates the target, fails loud on bad input, and is dry-run-by-default. A new `backlog/promote.ts` module holds the logic (backlog.ts is near the cap). Documentation wires the two tiers together.

## Technical Context

**Language/Version**: TypeScript (strict), executed via `tsx` (Node ≥ 20).

**Primary Dependencies**: the existing backlog backend (`src/backlog/backend.ts` — `createBacklogBackend`, `backlog.md` CLI via `spawnSync`, frontmatter projection), `src/backlog/mappings.ts` (labels), `src/backlog/root.ts` (install resolution), and the shared subaction-verb flag scanner used by `src/subcommands/backlog.ts`. Targets are referenced, not created: Spec Kit spec dirs (`specs/NNN-*`), the roadmap doc (`ROADMAP.md` via the roadmap engine), and feature `tasks.md` files.

**Storage**: `backlog.md` task files (frontmatter + body bullets) under the installation's backlog store (`.stack-control/backlog`). No new store.

**Testing**: Vitest, RED-first. Integration against the real backlog store on tmp fixtures (no mock filesystem, no abstraction layer).

**Target Platform**: `stackctl` CLI verb (in-tree plugin, dispatched via `bin/stackctl`).

**Project Type**: Single project / CLI (the in-tree `plugins/stack-control` plugin).

**Performance Goals**: N/A — a single bounded mutation per invocation.

**Constraints**: fail-loud (no fallback / no mock); strict typing (no `any`/`as`/`@ts-ignore`); files under the 300–500 line cap; CLI-first (verb is the core, skill is a thin adapter).

**Scale/Scope**: one new subaction + one new module + a thin skill adapter + docs. ~Small.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First (NON-NEGOTIABLE)**: PASS — every task is RED-first (write the failing test against the real backlog store, then implement). Contracts in `contracts/` drive the test list.
- **II. Integration-First, No Speculative Building**: PASS — built concretely against the existing backlog backend + real on-disk targets; no provider abstraction. The record-only target handling means we do not build target-creation machinery speculatively.
- **III. Branch on Capabilities, not Provider Identity**: N/A (no vendor branching) — target *kind* (spec / tasks.md / roadmap) is a capability axis, not a vendor identity.
- **V. No Fallbacks, No Mock Data**: PASS — missing item / malformed store / missing arg → non-zero exit, zero write; no silent skip.
- **VI. Strict Typing & Composition**: PASS — new `backlog/promote.ts` composed from the backlog backend; no inheritance; no type escapes.
- **VII. Commit & Push Early/Often**: PASS — RED then GREEN per task pair, push at task boundaries.
- **VIII. Faithful Tool Adoption**: PASS — promote references the existing creators (`define`/`roadmap add`); it does not reimplement them.
- **File-size cap**: PASS — handler lives in a new module; `backlog.ts` gains only a thin dispatch case.

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/012-backlog-promotion-seam/
├── plan.md              # This file
├── research.md          # Phase 0 — FR-011 / FR-007 / status-marker decisions
├── data-model.md        # Phase 1 — promotion linkage + status lifecycle
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/
│   └── backlog-promote.md   # CLI contract: flags, exit codes, dry-run/apply, idempotency
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/
│   ├── subcommands/
│   │   └── backlog.ts            # +1 SUBACTION_SPEC entry + dispatch case for `promote` (thin)
│   └── backlog/
│       ├── backend.ts            # reused as-is (read item, write body/labels)
│       ├── mappings.ts           # +promoted marker label constant if needed
│       ├── promote.ts            # NEW — promotion logic (record linkage, status, targets, guard)
│       └── promote-targets.ts    # NEW (if needed for cap) — target-ref parsing/validation per kind
├── skills/
│   └── backlog/SKILL.md          # document the promote subaction (thin adapter, quotes the verb)
└── tests/
    └── backlog/
        ├── promote.test.ts       # unit/integration: record-only, status, guard, fail-loud
        └── promote-targets.test.ts (if split)
```

**Structure Decision**: Single-project CLI. The promote handler is a **new module** (`backlog/promote.ts`, optionally `promote-targets.ts`) rather than inline in `backlog.ts` (228 lines, near the cap). The skill is a thin adapter. This mirrors how the existing backlog subactions are organized (backend logic in `backlog/`, dispatch in `subcommands/backlog.ts`).

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
