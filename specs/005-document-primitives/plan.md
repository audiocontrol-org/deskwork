# Implementation Plan: Generalized document-handling primitives — archive & curate (`design/document-primitives`)

**Branch**: `feature/stack-control` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-document-primitives/spec.md`

## Summary

Ship two generalized, document-agnostic primitives — `archive` (move terminal-status items into a sibling archive) and `curate` (ensure a live document is well-formed, well-ordered, properly archived; recognize an optional up-to-date seam) — as `stackctl` verbs + thin `/stack-control:*` skills inside `plugins/stack-control/`. A document becomes governable by declaring a **block-level grammar**; the engine resolves the grammar (embedded → project override → built-in default → fail loud), turns markdown into a **block stream**, parses that stream against the declared grammar into a typed tree of **Units**, and enforces universal identifier invariants (unique / non-ordinal / human-readable, identity decoupled from position). Generality is proven by two structurally different plugin-local documents (a title-keyed design-inbox and a `<phase>/<slug>` roadmap) governed by the **same engine** with only their grammars differing. A hard, machine-checked anti-coupling invariant keeps the shipped product free of any predecessor-plugin reference.

## Technical Context

**Language/Version**: TypeScript (strict) run via `tsx`, mirroring the existing in-tree `stack-control` shape. No `any` / `as Type` / `@ts-ignore`.

**Primary Dependencies** (resolved in [research.md](./research.md)): **peggy** (v5.x — maintained PEG.js successor; declarative `.peg` grammar text compiled at runtime; line-native `location()` spans) as the grammar→parser; **markdown-it** (`md.parse()` block tokens carry `token.map = [startLine, endLine]`) as the markdown block parser. Integration pattern: markdown-it block tokens → a **pre-parse excision step** that strips engine-level document chrome (the embedded grammar-declaration comment + the frontmatter, FR-002) so the grammar never sees its own declaration → a **normalized one-token-per-line** representation + a parallel line-range map → the declared `.peg` grammar parses that normalized text → Unit spans map back to original markdown line ranges. Peggy compiles + runs operator-authored grammar text **in-process at runtime**; per spec Assumptions (grammar trust model) this is accepted as trusted local config (same model as `.deskwork/*.ts` overrides), not restricted to an action-free subset.

**Storage**: files only — the live markdown document, its sibling `<doc>-archive.md`, and grammar files (`.peg`) either embedded in the document or under a grammar directory. The **provenance ledger lives in the archive file** (clarification 2026-06-07), never the live document. No database.

**Testing**: Vitest, **RED-first** (Constitution I), against **tmp fixture document trees on disk** (Constitution II; never mock the filesystem). The block→source line-range round-trip is the first RED test (research.md risk #1). Local-only — no CI test additions (project rule).

**Target Platform**: Node (Claude Code plugin), invoked via `stackctl` + skills.

**Project Type**: a shared engine library + three CLI verbs + three thin skills (archive, unarchive, curate) + two built-in grammars, all in `plugins/stack-control/`.

**Performance Goals**: documents are small (tens–hundreds of Units); wall-clock is dominated by a single markdown parse + a single grammar parse. No latency target beyond "interactive."

**Constraints**: fail-loud / no fallbacks (Principle V, FR-010); strict typing + files < 500 lines (Principle VI); **anti-coupling invariant** — zero predecessor-plugin references in the shipped surface, machine-checked (FR-011); isolation invariant — must not touch or destabilize the predecessor plugin (only reimplement the mechanism fresh).

**Scale/Scope**: per-document operations; two proof documents established this feature; the protocols that govern *when* those documents change are out of scope.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1.*

| Principle | Verdict | How this plan satisfies it |
|---|---|---|
| I. Test-First | PASS (planned) | Engine + verbs built RED-first under Vitest. The load-bearing block→line-range round-trip (research risk #1) gets its failing test first; the grammar **compile-failure / parse-failure / malformed-config actionable-error** path tested RED (trusted config per AUDIT-11, but compile/parse failures still fail loud with a located error). No spike kept as production. |
| II. Integration-First | PASS | The engine abstraction is derived from **two concrete grammars** (inbox + roadmap), not one imagined shape — the port is trusted only once both real documents flow through it (SC-005). No speculative provider abstraction; scope captured, cuts only where the operator drew them. |
| III. Branch on Capabilities | N/A | No provider plans here; this is document tooling, not the execution/governance back half. |
| IV. Division of Labor | PASS | The document is the operator's authoring artifact; the engine mutates it only on explicit `--apply` (the operator's act), and confines all bookkeeping (the provenance ledger) to the **archive file** — it never injects governance state into the live document. |
| V. No Fallbacks | PASS | Ungovernable document, parse failure, identifier-invariant violation, and unarchive collision all fail loud with zero writes (FR-010); no mock/placeholder data. |
| VI. Strict Typing & Composition | PASS | TS strict; one shared engine library composed (injected) into the verbs; every file < 500 lines (split plan below); no inheritance. |
| VII. Commit & Push Often | PASS | One logical change per commit, pushed; no AI attribution. |
| VIII. Faithful Tool Adoption | PASS | Reached this step via Spec Kit order (constitution → specify → clarify → plan); hooks honored. |
| IX. Execution-Backend Pluggability | N/A | Not the execution engine. |

**Project-specific gate — anti-coupling (FR-011):** a machine-checked scan asserts zero predecessor-plugin references across the new product **mechanism** (engine/verbs/skills/grammars). The two proof documents (`ROADMAP.md`, `DESIGN-INBOX.md`) are **excluded** — governed content that legitimately names the predecessor as lineage (FR-011). Treated as a release-blocking quality gate, not advice (thesis: mechanical interlock over instruction).

**Result: no violations.** Complexity Tracking is empty.

**Post-design re-check (after Phase 1)**: PASS — the design is a single shared library + three verbs + three skills (archive, unarchive, curate) + two declarative grammars. It introduces one new abstraction (the document grammar) which is immediately validated against two concrete instances (Principle II). No new vendor coupling; no fallbacks. No principle moved from PASS.

## Project Structure

### Documentation (this feature)

```text
specs/005-document-primitives/
├── plan.md              # This file
├── research.md          # Phase 0 — parser-tech decision
├── data-model.md        # Phase 1 — entities + invariants
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/           # Phase 1 — CLI verb contracts + grammar-declaration contract
│   ├── archive.md
│   ├── unarchive.md
│   ├── curate.md
│   └── grammar-declaration.md
├── checklists/
│   └── requirements.md  # from /speckit-specify (16/16)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/
│   ├── document-model/                  # NEW shared engine library (one module per concern, all < 500 lines)
│   │   ├── types.ts                      # Unit, GovernableDocument, GrammarSpec, ArchiveResult, CurateReport
│   │   ├── grammar-resolver.ts           # FR-001/FR-012: embedded → project override → built-in default → fail loud
│   │   ├── block-stream.ts               # markdown-it parse → excise chrome (grammar comment + frontmatter, FR-002) → normalized token-line stream + parallel line-range map
│   │   ├── grammar-parse.ts              # peggy.generate(grammarText) + parse → Unit tree (+ span back-mapping)
│   │   ├── identifier-validator.ts       # FR-005 invariants (unique / non-ordinal / human-readable)
│   │   ├── archive-engine.ts             # FR-006: select terminal → cut by span → append → ledger → coherence
│   │   ├── unarchive-engine.ts           # FR-007: reverse; collision guard
│   │   └── curate-engine.ts              # FR-008: well-formed + well-ordered(reorder) + properly-archived + up-to-date seam
│   ├── subcommands/
│   │   ├── archive.ts                    # stackctl archive  (dry-run default; --apply)
│   │   ├── unarchive.ts                  # stackctl unarchive
│   │   └── curate.ts                     # stackctl curate
│   └── (dispatcher registration for the three verbs)
├── grammars/                            # built-in default grammars (.peg)
│   ├── roadmap.peg
│   └── design-inbox.peg
├── skills/
│   ├── archive/SKILL.md                 # thin: dry-run → confirm → apply
│   ├── unarchive/SKILL.md               # thin: dry-run → confirm → apply (P1 recovery half — FR-007/US1)
│   └── curate/SKILL.md
├── ROADMAP.md                           # NEW plugin-local roadmap (proof instance #2; declares roadmap grammar)
├── DESIGN-INBOX.md                      # design-inbox lifted to plugin level (proof instance #1)
└── tests/document-primitives/
    ├── *.test.ts                         # Vitest, RED-first
    └── fixtures/                         # tmp fixture document trees

scripts/
└── check-no-predecessor-refs.sh          # FR-011 anti-coupling gate over the product mechanism (engine/verbs/skills/** (all three: archive/unarchive/curate)/grammars; proof docs excluded)
```

**Structure Decision**: A single shared `document-model/` library (the engine) consumed by three thin verb modules and three thin skills (archive, unarchive, curate), all inside `plugins/stack-control/` (succession rule: new capability lives in the successor, never the predecessor). The two proof documents are first-class files at the plugin root. Built-in grammars ship under `plugins/stack-control/grammars/`; adopting projects override at `.stack-control/grammars/<id>.peg` (FR-012). The anti-coupling gate (FR-011) is a standalone script a Vitest test also invokes; it scans the product mechanism (engine/verbs/skills/grammars), excluding the two proof documents as governed content.

## Complexity Tracking

> No Constitution Check violations — no entries.
