# Implementation Plan: Lifecycle Compass — an un-skippable workflow

**Branch**: `feature/stack-control` (session-pinned; not a per-spec branch) | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/024-lifecycle-compass/spec.md`; design record at `docs/superpowers/specs/2026-06-16-lifecycle-compass-design.md`

## Summary

Make the 022 lifecycle workflow the **driver**, not a passive observer, via a single
orientation-and-enforcement primitive — the **compass**. `stackctl workflow compass
<item> [--intent <action>]` reuses the 022 phase-derivation + gate-eval substrate to
return a deterministic, read-only verdict (`on-course` | `ahead` | `behind` |
`off-rail`) plus a gating exit code. Every lifecycle skill opens by consulting the
compass for its own item + intent and refuses loud on a non-zero verdict, so an agent
following its skills cannot skip a step. Authoring fuses capture (a spec dir cannot
exist through the front door without a roadmap node; an orphan is a hard error). The
back-half gate is made enforceable first by fixing two govern-runnability blockers
(FR-011 branch-slug resolution, FR-012 backtick-span crash / TASK-83) and unifying the
canonical feature identity (FR-013, TASK-139) — these sequence FIRST per FR-015.

Technical approach: a new pure verdict module (`compass.ts`) over the existing
`derivePhase` + `evaluateGate`; a fixed intent→phase enumeration derived from the
governed `WORKFLOW.md` phase/work vocabulary; a new `workflow compass` CLI verb mirroring
the thin-dispatch shape of the existing `workflow next`/`status` verbs; a shared
compass-precondition helper the lifecycle skill bodies invoke; an identity resolver the
compass, govern, the convergence record, and `close-related` all route through.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), run via `tsx` (Node ≥ 20). No build
step — in-tree source executed directly (per project convention).

**Primary Dependencies**: 022 workflow engine (`src/workflow/`: `phase-derivation.ts`,
`gate-eval.ts`, `workflow-context.ts`, `workflow-grammar.ts`, `transition-engine.ts`,
`workflow-types.ts`); roadmap model (`src/roadmap/`); govern (`src/govern/`:
`incremental-audit.ts`, `convergence-record.ts`, `protocol.ts`); installation anchor
(`src/config/`). No new third-party dependency.

**Storage**: Read-only over existing artifacts — the governed `WORKFLOW.md`, the roadmap
(`ROADMAP.md`), the spec dirs (`specs/<NNN>-<slug>/`), the govern convergence records
(`.stack-control/govern/…`), the local backlog. The compass writes nothing (FR-005).
Capture-fusion (FR-008) writes a roadmap node through the existing roadmap mutation path.

**Testing**: Vitest. Unit tests over the pure verdict function (fixture item-state ×
intent matrix); integration tests over the `workflow compass` CLI verb and the
skill-precondition helper against on-disk fixture installations (per `.claude/rules/testing.md`:
real fixture trees, never a mocked filesystem). No CI test-infra added (project rule).

**Target Platform**: CLI (`stackctl`) on developer machines; invoked from skill bodies
inside a Claude Code session and runnable in a plain shell.

**Project Type**: Single-project CLI plugin (`plugins/stack-control/`).

**Performance Goals**: Compass verdict is a sub-second read-only derivation over a single
item's artifacts (same order as `workflow next` today). No throughput target.

**Constraints**: Read-only + deterministic (identical output on re-run, no on-disk change)
— FR-005. Fail-loud on unknown intent / unresolvable item — FR-004 / Principle V.
Enforcement lives in skill bodies + CLI verbs only — never git hooks/CI
(`.claude/rules/enforcement-lives-in-skills.md`, Constitution Additional Constraints).
Source files ≤ 300–500 lines (Principle VI) — `payload-implement.ts` is already over (TASK-48),
so the FR-012 fix must not grow it further.

**Scale/Scope**: One new CLI verb, one pure verdict module, one intent enumeration, one
shared skill-precondition helper, one identity resolver, two govern-runnability fixes, one
capture-fusion change, and the report-only retirement on two enforced gates. Six lifecycle
skill bodies gain a compass-precondition opening (`define`, `execute`, the `after_implement`
govern hook, `ship`, `release`, `session-end`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.3.0. Per-principle:

- **I. Test-First (NON-NEGOTIABLE)** — PASS (planned). Every task is RED-first: the verdict
  matrix, the CLI gating exit codes, the skill-precondition refusal, the capture-fusion
  no-orphan invariant, and the two govern fixes each get a failing test written and seen to
  fail before code. No spike kept as production code.
- **II. Integration-First, No Speculative Building** — PASS. The compass is derived from the
  *two concrete* enforcement consumers already present (the `define` authoring path and the
  `after_implement` govern hook), not an imagined provider. The identity resolver (FR-013)
  generalizes only the three identity computations that demonstrably exist today (branch slug
  / spec-dir basename / node id). Capture-everything honored: the spec records the full
  surface; FR-015 is the operator-set sequencing, not an agent scope-cut.
- **III. Branch on Capabilities, Never Provider Identity** — N/A (no execution-backend or
  provider branching introduced).
- **IV. Division of Labor** — PASS. The compass reads provider/spec artifacts and the
  roadmap (progress) but never writes governance state back into a provider artifact.
- **V. No Fallbacks, No Mock Data Outside Tests** — PASS. Unknown intent fails loud (FR-004);
  unresolvable item fails loud (edge case); orphan spec dir is a hard error (FR-009); govern
  resolution failures stay FATAL with an actionable message (no silent slug fallback).
- **VI. Strict Typing & Composition** — PASS (planned). New modules are small, pure, and
  composed (verdict over derivation + gate-eval). No `any`/`as`/`@ts-ignore`. The FR-012 fix
  must not push `payload-implement.ts`/`incremental-audit.ts` past the cap.
- **VII. Commit & Push Early and Often** — PASS. One logical change per commit; push after each.
- **VIII. Faithful Tool Adoption** — PASS. This plan is produced by `/speckit-plan` in the
  prescribed chain (constitution → specify → clarify → plan → … ); no step skipped.
- **IX. Execution-Backend Pluggability** — N/A.
- **Installation-anchor invariant** — PASS. The compass is read-only; capture-fusion's node
  write goes through the installation-anchored roadmap mutation path; no new free `--repo-root`.
- **Enforcement-lives-in-skills** — PASS. Enforcement is the CLI verdict + the skill-body
  precondition; no git hook or CI gate. The honest-boundary doc requirement (FR-014) is met.

**Result: PASS — no violations. Complexity Tracking table left empty.**

## Project Structure

### Documentation (this feature)

```text
specs/024-lifecycle-compass/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature spec (already authored)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── compass-cli.md           # `workflow compass` CLI contract + exit codes
│   ├── intent-vocabulary.md     # the fixed intent→phase enumeration
│   ├── skill-precondition.md    # the embedded-skill refusal contract
│   ├── govern-resolution.md     # FR-011/FR-012 govern-runnability contract
│   └── canonical-identity.md    # FR-013 one-identity resolver contract
├── checklists/
│   └── requirements.md  # spec-quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root = `plugins/stack-control/`)

```text
src/
├── workflow/
│   ├── compass.ts            # NEW — pure verdict fn over derivePhase + gate-eval
│   ├── intent-vocabulary.ts  # NEW — fixed intent(skill/verb)→phase enumeration
│   ├── phase-derivation.ts   # reused (no change expected)
│   ├── gate-eval.ts          # reused
│   ├── workflow-context.ts   # reused (extended for orphan/off-rail inputs)
│   ├── workflow-types.ts     # extended — Verdict + Intent types
│   └── identity.ts           # NEW — canonical feature-identity resolver (FR-013)
├── govern/
│   ├── incremental-audit.ts  # FR-012 — backtick skill-span not a governed path
│   ├── protocol.ts           # FR-011 — item/spec-pointer resolution (resolveSlug seam)
│   └── convergence-record.ts # FR-013 — key via canonical identity (TASK-139)
├── subcommands/
│   ├── workflow.ts           # NEW verb `compass`; FR-010 retirement on enforced gates
│   └── govern.ts             # FR-011 — accept item-driven feature resolution
└── lifecycle-precondition.ts # NEW — shared compass-precondition helper for skills

skills/
├── define/SKILL.md           # FR-006 — open with compass precondition + FR-008 capture-fusion
├── execute/SKILL.md          # FR-006
├── ship/SKILL.md             # FR-006 (+ session-end, release if present as skills)
├── release/SKILL.md          # FR-006
└── session-end/SKILL.md      # FR-006

src/__tests__/
├── workflow/
│   ├── compass.test.ts             # SC-001 verdict matrix (pure)
│   ├── compass-cli.test.ts         # SC-001/SC-002 exit codes + read-only
│   └── intent-vocabulary.test.ts   # FR-004 unknown-intent fail-loud
├── lifecycle-precondition.test.ts  # SC-002 skill refusal
├── govern/
│   ├── govern-resolution.test.ts   # SC-004 branch-slug + backtick (FR-011/FR-012)
│   └── canonical-identity.test.ts  # SC-005 basename-collision (FR-013)
└── capture-fusion.test.ts          # SC-003 no orphan through front door
```

**Structure Decision**: Single-project CLI plugin. New workflow logic lands under
`src/workflow/` (composing the existing 022 engine), the shared skill helper at
`src/lifecycle-precondition.ts`, govern fixes in-place under `src/govern/` +
`src/subcommands/govern.ts`, and the new verb in the existing `src/subcommands/workflow.ts`
dispatcher. Tests mirror source under `src/__tests__/` with on-disk fixture installations.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
