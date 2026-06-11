# Implementation Plan: Audit-Protocol Hardening — Layout-Aware Feature & Audit-Log Resolution

**Branch**: `feature/stack-control` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-audit-protocol-hardening/spec.md`

## Summary

Widen the single shared feature-root resolver so the audit protocol locates a feature's `audit-log.md` under the Spec Kit layout `specs/NNN-slug/`, not only the legacy `docs/<version>/001-IN-PROGRESS/<slug>/`. This unblocks running governance on spec-structured features (it is what blocks `govern`/gate on `specs/013` today). Companion: when the resolved audit-log is absent, `audit-barrage-lift` scaffolds it from the canonical header instead of aborting. Approach: one function widened (`resolveFeatureRoot`) flows two concrete layouts through one helper (Constitution Principle II), every behavioral change pinned RED-first (Principle I), neither-layout fails loud (Principle V).

## Technical Context

**Language/Version**: TypeScript (strict), executed via `tsx`; Node.js standard library (`node:fs`, `node:path`).

**Primary Dependencies**: in-tree only — `src/scope-discovery/util/feature-root.ts` (the resolver), `src/subcommands/audit-barrage-lift.ts` (lift + scaffold), `src/subcommands/spec-governance-gate.ts` (consumer; the must-fix call site). No new third-party dependency.

**Storage**: filesystem — feature directories (`docs/<v>/001-IN-PROGRESS/<slug>/` and `specs/NNN-slug/`) and their `audit-log.md` files.

**Testing**: Vitest (`npm --workspace @deskwork/... test` / `npx vitest`), fixture trees on disk (no fs mocking, per `.claude/rules/testing.md`).

**Target Platform**: Node CLI (`stackctl`), darwin/linux.

**Project Type**: single-project CLI (the stack-control plugin's in-tree TypeScript).

**Performance Goals**: N/A — path resolution is a handful of `existsSync`/`readdir` calls; negligible.

**Constraints**: strict typing (no `any` / `as Type` / `@ts-ignore`); files stay 300–500 lines (`feature-root.ts` is ~105 lines today and stays small); backward compatibility with the `docs/` layout including the lex-greatest-version contract; fail-loud on unresolvable slug (no fallback).

**Scale/Scope**: small — one resolver function widened, one lift scaffold path, plus a decision on the direct-path constructors in the scope-* verbs (reconcile to the helper or explicitly scope). ~2 behavioral changes + their RED tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Note |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | ✅ | FR-010: RED-first test for spec-layout resolution + for the missing-audit-log scaffold, each seen failing on current code first. |
| II. Integration-First, No Speculative Building | ✅ | The widened resolver is derived from **two concrete layouts** (`docs/` and `specs/`) both flowing through it — the "two real instances before the abstraction is trusted" rule, exactly. No imagined third layout is designed for. |
| III. Branch on Capabilities, not Provider | ✅ (N/A) | No provider/vendor branching introduced; resolution branches on filesystem layout, not tool identity. |
| IV. Division of Labor | ✅ | Resolution is substrate concern (deskwork-owned physical path); no provider artifact is written. |
| V. No Fallbacks Outside Tests | ✅ | FR-006: neither-layout fails loud naming both searched layouts; no silent wrong-target. |
| VI. Strict Typing & Composition | ✅ | Resolver stays a small pure helper; result type extended, not `any`-cast. |
| VII. Commit & Push Early and Often | ✅ | One logical change per commit; pushed. |
| VIII. Faithful Tool Adoption | ✅ | Authored via Spec Kit order specify → (clarify skipped, 0 markers) → plan → tasks; documented the skip. |
| IX. Execution-Backend Pluggability | ✅ (N/A) | Not an execution-engine change. |

**No violations → Complexity Tracking is empty (omitted).**

## Project Structure

### Documentation (this feature)

```text
specs/013-audit-protocol-hardening/
├── spec.md              # narrowed feature spec
├── plan.md              # this file
├── research.md          # Phase 0 — verified current state + decisions
├── data-model.md        # Phase 1 — entities
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/           # Phase 1 — resolver + lift-scaffold contracts
│   ├── resolve-feature-root.md
│   └── audit-log-scaffold.md
├── checklists/
│   └── requirements.md  # spec quality checklist
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root → `plugins/stack-control/`)

```text
plugins/stack-control/src/
├── scope-discovery/util/
│   ├── feature-root.ts                 # US1 — widen resolveFeatureRoot to the specs/NNN-slug layout
│   └── __tests__/feature-root.test.ts  # US1 — add specs-layout + precedence + neither-layout RED tests; keep lex-greatest contract
├── subcommands/
│   ├── audit-barrage-lift.ts           # US2 — scaffold audit-log from canonical header when absent (replace the return-2 abort)
│   ├── spec-governance-gate.ts         # US1 consumer — resolves via the widened helper (the must-fix call site; likely no change beyond the helper)
│   ├── slush-findings.ts               # US1 consumer — via the widened helper
│   └── backlog.ts                      # US1 consumer — via the widened helper
└── scope-discovery/
    ├── scope-inventory-cli.ts          # FR-003 cross-consumer — direct docs/1.0/001-IN-PROGRESS path; reconcile-to-helper OR explicitly scope
    ├── scope-widen-cli.ts              #   "
    ├── scope-export.ts                 #   "
    ├── scope-inventory.ts / scope-widen.ts  #   "
    └── doctor-rules/provenance-orphaned-entries.ts  #   "
```

**Structure Decision**: Single-project, in-tree change. The leverage point is the **one** shared resolver `feature-root.ts` (extracted per AUDIT-20260530-15 precisely so a layout change touches one place). Widening it fixes all four helper-callers — including the must-fix `spec-governance-gate.ts` audit-log resolution — without per-call edits. The direct-path constructors in the scope-* family are a documented second tier (FR-003): the plan's research resolves whether they are reconciled to the helper in this feature or scoped to a follow-on (they are not on the critical path of the governance blocker, which goes through the helper).

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
