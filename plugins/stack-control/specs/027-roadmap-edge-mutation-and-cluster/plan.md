# Implementation Plan: Roadmap edge-mutation and cluster (discoverability-first)

**Branch**: `feature/stack-control` (one-branch program; spec dir `specs/027-roadmap-edge-mutation-and-cluster`) | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md); re-scoped by ADR [`2026-06-18-governed-markdown-foundation-adr.md`](../../docs/superpowers/specs/2026-06-18-governed-markdown-foundation-adr.md).

## Summary

Make roadmap mutation possible and obvious without reinventing commodities. Three deliverables: (1) **adopt `commander`** so `roadmap`'s `--help`/usage/per-subaction help/completion derive from one command definition (non-drift), with `roadmap` the first verb migrated and the rest unchanged; (2) a **`roadmap cluster`** verb (alias `group`) implemented as a new `mutations.ts` function reusing the existing build→revalidate→write atomicity; (3) the **honest-interim `ROADMAP.md` header**. The governed-markdown store is kept; the `roadmap-model ← document-model` seam is hardened. Deferred (captured siblings): the full edge-mutation verb set and the ~49-verb consolidation rollout.

## Technical Context

**Language/Version**: TypeScript (strict), Node ESM, run via `tsx`.
**Primary Dependencies**: NEW `commander` (+ `@types` if needed); existing `document-model`, `roadmap-model`, `mutations.ts`.
**Storage**: governed markdown (`ROADMAP.md`) via `document-model` — unchanged.
**Testing**: Vitest — unit (cluster validation, parser non-drift) + integration (fixture `ROADMAP.md` round-trips). Local-only; no CI browser/boot tests.
**Target Platform**: CLI (`stackctl`), macOS/Linux dev.
**Project Type**: single-project CLI.
**Performance Goals**: N/A (roadmap ~50 nodes; sub-second).
**Constraints**: zero `as`/`any`/`@ts-ignore` (Principle VI); files ≤300–500 lines; no fallbacks/mock outside tests (Principle V); `@/`-style import conventions of the package.
**Scale/Scope**: ~50 roadmap nodes; one verb migrated this feature.

## Constitution Check

*GATE: passed (pre-Phase-0 and re-checked post-design).*

- **I. Test-First (NON-NEGOTIABLE):** RED tests precede impl — cluster validation/atomicity tests + the parser non-drift conformance test + help-output assertions, all failing first. PASS (planned).
- **II. Integration-First, No Speculative Building:** cluster derived from the real offing instance; the store seam is hardened by *boundary discipline*, NOT a speculative pluggability abstraction (no second store built). PASS.
- **III. Branch on Capabilities, not Provider Identity:** N/A (no provider branching introduced).
- **V. No Fallbacks Outside Tests:** the honest header is the *opposite* of a fallback; refusals fail loud (exit 2) with named cause; no silent skips. PASS.
- **VI. Strict Typing & Composition:** the one risk is the parser-options boundary — mitigated by a typed per-verb adapter and a RED test asserting zero casts; cluster composes existing `mutations.ts` primitives (composition, no inheritance). Watch file sizes (`mutations.ts` already ~300 lines — cluster may force a split). PASS with the noted watch.
- **VII. Commit & Push Early/Often:** task-boundary commits + push. PASS.
- **VIII. Faithful Tool Adoption:** adopting `commander` rather than hand-rolling a parser is this principle in action. PASS (and the motivating realization for the ADR).
- **IX. Execution-Backend Pluggability:** N/A.

No violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/027-roadmap-edge-mutation-and-cluster/
├── plan.md            # this file
├── research.md        # Phase 0 (parser lib; atomicity reuse; multi-parent; seam)
├── data-model.md      # Phase 1 (WorkItem, ClusterRequest, Edge, VerbCommandDefinition)
├── quickstart.md      # Phase 1 (6 runnable validation scenarios)
├── contracts/
│   └── roadmap-cli.md # Phase 1 (cluster + self-documenting help + honest header)
└── tasks.md           # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root = `plugins/stack-control/`)

```text
src/
├── cli.ts                       # flat SUBCOMMANDS dispatcher — mount roadmap as a commander Command; un-migrated verbs unchanged
├── roadmap/
│   ├── roadmap-model.ts         # typed-graph projection (store seam) — possibly widen partOf to string[]
│   ├── mutations.ts             # ADD cluster() reusing build→revalidate→write; may split if >500 lines
│   └── views.ts                 # unchanged
├── subcommands/
│   └── roadmap.ts               # re-expressed via the commander command definition (single help+parse source)
└── cli-help/                    # (new, if needed) the typed commander adapter + completion wiring

tests/roadmap/
├── cluster.test.ts              # NEW — create/reuse/chain/multi-parent/refusal-atomicity
├── roadmap-help-nondrift.test.ts# NEW — help enumerates exactly the accepted flags
└── helpers.ts                   # fixture roadmaps (existing)

ROADMAP.md                       # honest-interim header (FR-016)
```

**Structure Decision**: single-project CLI; changes localized to `src/roadmap/`, `src/subcommands/roadmap.ts`, `src/cli.ts`, plus the new parser adapter and tests. No new top-level modules beyond the optional `cli-help/` adapter.

## Complexity Tracking

No Constitution violations to justify. (One watch item: if adding `cluster` pushes `mutations.ts` past the 300–500-line cap, split per-mutation modules — a refactor, not a complexity exception.)
