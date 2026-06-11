# Implementation Plan: Govern the spec, not just the implementation (`design/spec-governance`)

**Branch**: `feature/pluggable-lifecycle-providers` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-spec-governance/spec.md`

## Summary

Extend stack-control's cross-model audit-barrage governance **left**, from `after_implement` (the founding `impl/governance` extension) to **definition time**. Deliver a Spec Kit governance extension that fires the barrage over a **spec** automatically at `after_clarify` (configurable `after_plan`), gates spec graduation on the **ported `dw-lifecycle` audit-protocol convergence criterion** (0 HIGH + 0 MED in one iteration, or 0 HIGH across two consecutive), and fails loud when the audit capability is absent. The technical approach **composes existing dw-lifecycle verbs in-house** (`audit-barrage-render` → `audit-barrage` → `audit-barrage-lift`) — mirroring the founding `govern.sh` — and reuses the already-mechanized convergence logic (`check-barrage-dampener`), rewired from a slush/promote *disposition* signal into a *graduation gate*. No reimplementation of the barrage or the protocol.

## Technical Context

**Language/Version**: TypeScript (strict) run via `tsx` for any new `stackctl` verb (mirrors dw-lifecycle / stack-control in-tree shape); Bash for the extension orchestration script (mirrors `deskwork-governance/scripts/bash/govern.sh`).

**Primary Dependencies**: the dw-lifecycle audit-barrage verbs (`audit-barrage-render`, `audit-barrage`, `audit-barrage-lift`) composed in-house; the dw-lifecycle convergence logic (`check-barrage-dampener` Rule A/Rule B); the Spec Kit extension mechanism (`extension.yml` hooks: `after_clarify`, `after_plan`); `git`; `jq`. (All in-house per FR-006 until `multi/migrate-audit-barrage` rehomes them.)

**Storage**: files — the per-feature `audit-log.md` (finding state machine), the barrage `audit-runs/<ts>-<slug>/` run dirs, and the spec/plan artifacts under audit. No database.

**Testing**: Vitest (unit + integration against tmp fixture spec trees) for any new verb; RED-first Bash smoke for the orchestration script (mirroring `scripts/smoke-govern-untracked-fold.sh`). Local-only — no CI test additions (project rule).

**Target Platform**: developer workstation + Spec Kit/Claude Code; unattended-capable (the convergence loop must run without an operator present, bounded).

**Project Type**: Spec Kit governance extension + (at most one) supporting `stackctl` verb inside the `stack-control` plugin.

**Performance Goals**: wall-clock is dominated by the model CLIs (the barrage). The convergence loop MUST be **bounded** by a configured iteration ceiling (FR-014) so an unattended run terminates; no per-iteration latency target beyond "model-bound."

**Constraints**: no fallbacks / fail-loud when the audit capability is absent (FR-005); strict typing, files < 500 lines (Principle VI); in-house composition — never reimplement the barrage/protocol (FR-006); isolation invariant — must not destabilize `dw-lifecycle` (only compose its public verbs).

**Scale/Scope**: per-spec governance; one extension (`spec-governance`) with one or two hook commands + the convergence-gate evaluation. Single feature, independently shippable.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Verdict | How this plan satisfies it |
|---|---|---|
| I. Test-First | PASS (planned) | The gate verb is built RED-first (Vitest); the orchestration script gets a RED-first Bash smoke (mirrors `smoke-govern-untracked-fold.sh`). No spike kept as production. |
| II. Integration-First | PASS | Composes the **real** dw-lifecycle barrage (a concrete instance) and the **real** spec artifact; no imagined provider abstraction. The convergence criterion is ported from a working implementation, not invented. |
| III. Branch on capabilities | PASS | Governance branches on findings/severity/agreement only — never on which tool authored the spec. |
| IV. Division of Labor | PASS | The spec (authoring intent) is **read, never written** by governance; governance writes only the `audit-log.md` + run dirs (progress/governance state). One-way. Spec fixes are the author's act, not governance writing intent. |
| V. No Fallbacks | PASS | Fail loud if the audit capability (barrage verbs / model families) is absent — mirrors `govern.sh`'s `command -v dw-lifecycle` guard (exit 2). Never silent-skip (FR-005). |
| VI. Strict Typing & Composition | PASS | TS strict, no `any`/`as`/`@ts-ignore`, files < 500 lines, compose verbs over reimplement. |
| VII. Commit & Push Often | PASS | One logical change per commit, pushed; no AI attribution. |
| VIII. Faithful Tool Adoption | PASS | Uses Spec Kit's extension hook mechanism faithfully (`after_clarify`/`after_plan`), mirroring the founding `deskwork-governance` `after_implement` extension; we reached this step via the prescribed order. |
| IX. Execution-Backend Pluggability | N/A | This is a design-phase governance feature, not the execution engine. |

**Result: no violations.** Complexity Tracking below is empty.

**Post-design re-check (after Phase 1)**: PASS — the design is composition of existing dw-lifecycle verbs + one small `stackctl` gate verb + a mirrored extension; it introduces no new abstraction, no new vendor coupling, and no fallbacks. No principle moved from PASS.

## Project Structure

### Documentation (this feature)

```text
specs/004-spec-governance/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── spec-governance-extension.md
│   └── convergence-gate.md
├── checklists/
│   └── requirements.md  # from /speckit-specify (16/16)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── spec-kit/
│   └── spec-governance/                      # NEW extension (mirrors deskwork-governance/)
│       ├── extension.yml                      # hooks: after_clarify (default), after_plan (configurable)
│       ├── README.md
│       ├── commands/
│       │   └── speckit.spec-governance.govern-spec.md
│       └── scripts/bash/
│           └── govern-spec.sh                 # mirrors govern.sh; audits the SPEC artifact (+ plan when after_plan)
├── src/
│   └── subcommands/
│       └── spec-governance-gate.ts            # NEW stackctl verb: evaluate convergence criterion → gate verdict
│                                              # (composes dw-lifecycle barrage history + check-barrage-dampener logic)
└── tests/
    ├── spec-governance-gate.test.ts           # Vitest, RED-first
    └── ...
scripts/
└── smoke-govern-spec.sh                        # RED-first Bash smoke driving govern-spec.sh
```

**Structure Decision**: The feature is a **Spec Kit governance extension** under `plugins/stack-control/spec-kit/spec-governance/`, mirroring the proven `deskwork-governance` shape (manifest + command + bash orchestration). The only TypeScript is one `stackctl` verb that turns the barrage run history into a convergence **gate verdict** (the protocol port). Everything else is composition of existing dw-lifecycle verbs. This keeps the new surface small, in-house, and faithful to the founding extension's pattern.

## Complexity Tracking

> No Constitution Check violations — no entries.
