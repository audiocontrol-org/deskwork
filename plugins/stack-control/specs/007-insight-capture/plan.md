# Implementation Plan: Low-friction insight capture

**Branch**: `feature/stack-control` (one long-lived program branch) | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-insight-capture/spec.md`

## Summary

Add a native `stackctl inbox` verb that makes design-idea capture a first-class, **one-move, fail-safe** operation against the governed `DESIGN-INBOX.md`, plus deliberate-pass triage (`promote`/`drop`). The capture path is the direct analog of the existing `roadmap add` mutation: build a candidate document, **re-validate the whole governed document before any write**, and write atomically with **zero-write-on-failure** — eliminating today's hand-edit gap where a raw append can corrupt the inbox undetected. Triage reuses the `advance`-style status rewrite (`captured → promoted | dropped`) and the existing generic `curate`/`archive` engines for lean-keeping. Shipping retires the interim convention (`.claude/rules/design-inbox.md` + the docs-tree pointer) so one mechanism and one source of truth remain.

## Technical Context

**Language/Version**: TypeScript (strict), executed via `tsx` (Node) — matches the existing plugin.

**Primary Dependencies**: the in-tree document-primitives engine (`src/document-model/*` — `loadDocument`/`loadDocumentFromSource`, edge/identifier validators, `writeFileSync` atomic write); the existing `design-inbox` grammar (`grammars/design-inbox.peg`, **unchanged**); the existing `curate`/`archive`/`unarchive` engines (generic, reused). **No new external dependencies.**

**Storage**: the governed `plugins/stack-control/DESIGN-INBOX.md` markdown file — the single source of truth. Lean-keeping moves terminal entries to the sibling `DESIGN-INBOX-archive.md` + ledger (existing archive engine).

**Testing**: Vitest. Mutation unit tests call the mutation functions directly against tmp-copied committed fixtures; verb tests invoke the CLI end-to-end via `spawnSync` (the `runCli` helper). RED-first per Principle I.

**Target Platform**: `stackctl` CLI (Node), local interactive session.

**Project Type**: single project (the stack-control plugin; CLI tool).

**Performance Goals**: capture/promote/drop are a single read → validate → write of one small markdown file — effectively sub-second; no scale concerns.

**Constraints**: zero-write-on-failure (the candidate is validated via `loadDocumentFromSource` before `writeFileSync`); fail-loud on any precondition gap (Principle V); dry-run by default, `--apply` to write (mirrors `roadmap`); files ≤ 500 lines (Principle VI); no `any`/`as`/`@ts-ignore`.

**Scale/Scope**: the inbox holds tens of entries; the engine already validates the live ROADMAP/inbox at this size with no concern.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan satisfies it |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | ✅ | Every task is RED-first: capture/promote/drop mutation tests and verb tests (incl. the zero-write-on-failure assertion) are written and seen failing before implementation. |
| II. Integration-First, capture-don't-cut | ✅ | Built concretely on the *existing* `roadmap add`/`advance` instances and the real governed inbox — not an imagined abstraction. The spec captured everything; scope was set by explicit operator clarification, not agent cuts. |
| III. Branch on capability, not provider | ✅ (N/A axis) | No provider/plan-source branching exists in this feature. |
| IV. Division of labor | ✅ (N/A) | The inbox is deskwork-owned substrate, not a provider intent artifact; no write-back into a provider source. |
| V. No fallbacks / fail-loud | ✅ | Missing/ungovernable inbox, absent target entry, duplicate identifier, empty idea → descriptive `DocumentModelError`, never a silent no-op or partial write. |
| VI. Strict typing & composition | ✅ | Composition over the existing engine; interface-typed inputs; new modules kept well under the cap (verb ~≤140, mutations ~≤250). No `any`/`as`. |
| VII. Commit & push early and often | ✅ | One logical change per commit (RED test, then GREEN impl), pushed at task boundaries; no AI attribution. |
| VIII. Faithful tool adoption | ✅ | Authored through the front door's Spec Kit chain in order (specify → clarify → plan → …). |
| IX. Execution-backend pluggability | ✅ (N/A axis) | No execution engine/backends in this feature. |

**Result: PASS — no violations.** Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-insight-capture/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions grounded in the existing code
├── data-model.md        # Phase 1 — entry/Unit shape + status lifecycle
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/
│   └── inbox-cli.md     # Phase 1 — the `stackctl inbox` verb contract
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/
│   ├── cli.ts                      # +1 line: register `inbox` in SUBCOMMANDS
│   ├── subcommands/
│   │   └── inbox.ts                # NEW — thin verb dispatcher (capture/promote/drop/list); flag validation; dry-run/apply; exit 0/2
│   ├── inbox/
│   │   └── mutations.ts            # NEW — capture()/promote()/drop() over the design-inbox doc (mirrors roadmap/mutations.ts: build candidate → loadDocumentFromSource re-validate → atomic write; zero-write-on-failure)
│   └── document-model/             # UNCHANGED (reused: loadDocument, validators, atomic write)
├── grammars/design-inbox.peg       # UNCHANGED (reused)
└── tests/
    └── inbox/
        ├── fixtures/               # committed sample inbox docs
        ├── mutations-capture.test.ts   # RED-first
        ├── mutations-promote-drop.test.ts
        └── verb-inbox.test.ts          # end-to-end via runCli (spawnSync)

# US3 — retire the interim convention (deletions + reference updates):
.claude/rules/design-inbox.md                                   # REMOVED
docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/design-inbox.md  # REMOVED (pointer)
# + update any references (the generality test's SOURCE path is already decoupled; README/rules cross-refs repointed to the verb)
```

**Structure Decision**: One new verb namespace, `stackctl inbox`, mirroring the established `stackctl roadmap` shape (one noun verb + subactions), with subactions `capture` (the `roadmap add` analog), `promote`/`drop` (the `advance` analog), and `list` (a read-only view). Lean-keeping is NOT reimplemented — the existing generic `curate`/`archive`/`unarchive` already operate on any governed doc including `DESIGN-INBOX.md`. *(Open to operator redirect to a top-level `stackctl capture` instead of `inbox capture`; the mutation core is identical either way.)*

## Complexity Tracking

> No constitution violations — no entries.
