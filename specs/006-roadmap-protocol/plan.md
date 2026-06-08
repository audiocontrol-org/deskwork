# Implementation Plan: Roadmap protocol

**Branch**: `feature/stack-control` (program single-branch) | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-roadmap-protocol/spec.md` + approved design `docs/superpowers/specs/2026-06-08-roadmap-protocol-design.md`

## Summary

Make the roadmap a governed, heading-keyed markdown document that is a DAG of work items, plus the protocol (skill + `stackctl roadmap` verb) that keeps it live. Technical approach in three layers, building on the shipped 005 document-model engine:

1. **Grammar rewrite** — the roadmap document moves from row-keyed (table) to heading-keyed (`## <identifier>` per item). A new `roadmap` grammar (heading-keyed, identifier production `<phase>:<kind>/<slug>`, phase as order-key, declared edge-fields) is the contract `archive`/`curate` operate through — so the grammar must describe the target structure before the primitives work on it.
2. **Generic edge capability (engine)** — extend `GrammarSpec` + the document-model so any heading-keyed grammar can declare **edge-fields** (Unit→Unit references). The engine extracts them from each Unit body, enforces referential integrity (FR-005) and acyclicity for edge-types declared acyclic (FR-006). Derived concretely from the roadmap (Constitution II: integration-first), but kept grammar-declared so it composes with `curate`/`archive` unchanged.
3. **Roadmap semantic layer** — a new `src/roadmap/` module + `stackctl roadmap` verb + `/stack-control:roadmap` skill that interprets the graph against the status vocabulary: next-ready / blocked-by / blocks, derived views (ready-list, blocked report, mermaid), the mutation set (add / advance / decompose / reclassify / defer / archive — each re-validating the whole graph, zero-write on failure), one-move emergent-work capture, and report-only reconciliation (explicit correspondence field + artifact-progression signal). Migration of the degraded prose roadmap into the canonical heading-keyed document is the first dogfood.

## Technical Context

**Language/Version**: TypeScript (strict), run via `tsx` (no `ts-node`, no `npx tsx`); ESM with `@/` import pattern.

**Primary Dependencies**: existing 005 document-model engine (`plugins/stack-control/src/document-model/`); `peggy` (runtime PEG compile); `yaml` (grammar metadata). No new runtime dependency anticipated.

**Storage**: governed markdown files on disk — the canonical roadmap (`plugins/stack-control/ROADMAP.md`, rewritten heading-keyed) + its archive companion + provenance ledger (existing `ledger.ts`). No database (spec Settled Decision).

**Testing**: Vitest. RED-first per Constitution I. Fixture documents on disk (never mock the filesystem, per `.claude/rules/testing.md`).

**Target Platform**: Node CLI (`stackctl`) + Claude Code skill, loaded from the `stack-control` plugin.

**Project Type**: single project — CLI + library (the plugin's in-tree TypeScript).

**Performance Goals**: interactive CLI; roadmap is ~dozens of items, single-writer, parsed in-context. No throughput target; correctness + fail-loud over speed.

**Constraints**: source files 300–500 lines (Constitution VI) — the `document-model/` dir is healthy (max file 228 lines) but growing; the edge capability and the roadmap semantic layer MUST land as new, focused modules rather than bloating existing files. No fallbacks / fail-loud (V). Enforcement in skill body + CLI verb, never a git hook.

**Scale/Scope**: one new grammar; one generic engine capability (edge extraction + integrity + acyclicity); one semantic layer (graph queries + views + 6 mutations + reconcile); one verb + one skill; one migration of the live roadmap.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First (NON-NEGOTIABLE)** — PASS (planned). Every capability is RED-first: edge-field parsing, referential-integrity failure, cycle detection, ready/blocked computation, each mutation's zero-write-on-failure, reconcile report-only, and the migration lossless-port. No code before a failing test.
- **II. Integration-First, No Speculative Building** — PASS. The generic edge capability is derived from the concrete roadmap instance (the one real consumer), not designed from an imagined second grammar. Capture-then-scope: the spec captured everything; the only scope cut (hard gating) is an explicit operator decision (FR-018), recorded as a future roadmap item, not an agent-inserted YAGNI.
- **III. Branch on Capabilities, Never Provider Identity** — N/A (no provider/execution-backend branching in this feature).
- **IV. Division of Labor** — PASS. The roadmap is intent; reconciliation is report-only and never writes execution state back into the document (FR-017). One-way read of on-disk progress.
- **V. No Fallbacks, No Mock Data Outside Tests** — PASS. Dangling edge, cycle, ambiguous correspondence, invalid graph → descriptive fail-loud errors (`DocumentModelError`), never a silent default. Mock data only in tests.
- **VI. Strict Typing & Composition** — PASS (planned). No `any`/`as`/`@ts-ignore`. New modules kept < cap; composition over inheritance; DI of grammar/paths. Module boundary plan in Project Structure below specifically addresses the file-size constraint.
- **VII. Commit & Push Early and Often** — PASS (process). One logical change per commit, no AI attribution.
- **VIII. Faithful Tool Adoption** — PASS. Spec Kit order followed: this is `/speckit-plan`; `/speckit-tasks` next. `after_implement` governance will fire.
- **IX. Execution-Backend Pluggability** — N/A (no execution engine here).

**Initial gate: PASS** — no violations; Complexity Tracking empty.

**Post-Design re-check (after Phase 1): PASS** — the design surfaced a *simplification*, not a new violation: the field taxonomy (R2) shows only `depends-on`/`part-of` are integrity-checked edges, so the generic engine capability stays small and the roadmap layer holds the semantics. Module boundaries (Project Structure) keep every new file under the 300–500 line cap (VI). No principle requires justification; Complexity Tracking remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/006-roadmap-protocol/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions on edge extraction, heading level, algorithms
├── data-model.md        # Phase 1 — WorkItem, edges/fields, GrammarSpec extension, graph
├── quickstart.md        # Phase 1 — end-to-end validation scenarios
├── contracts/           # Phase 1 — verb CLI contract, grammar-artifact contract, engine edge API
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── grammars/
│   ├── roadmap.peg              # REWRITTEN: row-keyed → heading-keyed; <phase>:<kind>/<slug>; declares edge-fields
│   └── roadmap-legacy.peg       # (option) keep old row-keyed grammar until migration completes, then retire
├── src/
│   ├── document-model/          # 005 engine — EXTENDED, not rebuilt
│   │   ├── types.ts             # + EdgeFieldSpec, Edge, extend GrammarSpec + Unit (carry edges)
│   │   ├── grammar-resolver.ts  # + parse `edgeFields` metadata block
│   │   ├── edges.ts             # NEW (generic): extract edge-fields from Unit bodies; referential integrity; acyclicity
│   │   └── (archive/curate/unarchive/document/ordering/... unchanged)
│   └── roadmap/                 # NEW semantic layer (one concern per file, < cap)
│       ├── graph.ts             # ready / blocked-by / blocks / topo order over depends-on (+ phase tiebreak)
│       ├── views.ts             # ready-list, blocked report, mermaid DAG (derived, never persisted)
│       ├── mutations.ts         # add / advance / decompose / reclassify / defer / archive (graph re-validate, zero-write)
│       ├── reconcile.ts         # execute hook: correspondence field + artifact-progression signal; report-only
│       └── roadmap-model.ts     # shared: load roadmap as a typed graph over the document-model
├── src/subcommands/
│   └── roadmap.ts               # NEW verb (thin: dispatch subactions to src/roadmap/*); composes archive/curate
├── src/cli.ts                   # + register `roadmap`
├── skills/roadmap/SKILL.md      # NEW skill (discipline lives here + the verb)
└── ROADMAP.md                   # migrated to heading-keyed canonical (US6)

plugins/stack-control/tests/
├── document-primitives/         # + edge-extraction, integrity, acyclicity, heading-keyed roadmap parse
└── roadmap/                     # NEW: graph queries, mutations zero-write, reconcile report-only, migration port
```

**Structure Decision**: Single project; extend the document-model engine in place with one new generic module (`edges.ts`) + small type additions, and add a separate `src/roadmap/` semantic layer split by concern (graph / views / mutations / reconcile / model) so no file approaches the 300–500 line cap. The verb stays thin and composes existing `archive`/`curate`. The grammar rewrite is the load-bearing first step (the primitives operate through it).

## Complexity Tracking

> No Constitution violations. Section intentionally empty.
