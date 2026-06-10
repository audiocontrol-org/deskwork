# Implementation Plan: deskwork governance as a Spec Kit `after_implement` extension

**Branch**: `feature/pluggable-lifecycle-providers` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-speckit-backhalf-slice/spec.md`

## Summary

Package deskwork's existing governance back half (cross-model `audit-barrage` + lifting findings into the feature `audit-log.md`) as a **Spec Kit extension** that registers a command on the `after_implement` hook. When `/speckit-implement` finishes, the hook fires the governance command automatically: it gathers the resulting diff, invokes deskwork's existing `dw-lifecycle audit-barrage` (multi-CLI fan-out) against the implemented work, and lifts findings into `audit-log.md` — cross-model, with zero branching on which tool authored or executed the plan. The slice is mostly *wiring existing deskwork verbs into Spec Kit's extension system*; new code is minimal (manifest + command body + a thin orchestration script + a findings-context helper).

## Technical Context

**Language/Version**: TypeScript (run via `tsx`) for any new deskwork-side logic; Bash for the extension's orchestration script; Markdown for the extension command body (a Claude skill). Spec Kit extension config is YAML/JSON.

**Primary Dependencies**: Spec Kit 0.9.4 extension system (`extension.yml`, `hooks.after_implement`, `specify extension add --dev`); deskwork's existing CLI verbs `dw-lifecycle audit-barrage-render`, `dw-lifecycle audit-barrage`, `dw-lifecycle audit-barrage-lift`; `git diff` for the implemented-work context.

**Storage**: Files only — audit run dirs under `.dw-lifecycle/scope-discovery/audit-runs/`, findings in the feature `audit-log.md`. No database.

**Testing**: `vitest` for any new TypeScript helper (test-first per Constitution I). The extension wiring + hook firing is exercised by a local integration smoke (install the extension `--dev`, run a stub implement, assert a run-dir + findings appeared). No CI additions (project rule: local smokes only).

**Target Platform**: Local developer machine (macOS/Linux), Claude Code as the Spec Kit integration agent.

**Project Type**: CLI / plugin-extension (single project; no frontend/backend split).

**Performance Goals**: N/A — governance fires once per implement run; bounded by the operator's CLI subscriptions, not throughput.

**Constraints**: Whole-run hook granularity (governance fires once after the entire implement, not per task) — accepted for this slice (spec FR-006). Multi-CLI fan-out must spawn ≥2 model lanes (FR-004).

**Scale/Scope**: One extension, one hook, one command; reuses existing verbs. Net-new code target: well under the 300–500-line file cap, spread across small modules.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Checked against the project constitution v1.0.0 (`.specify/memory/constitution.md`):

| Principle | Status | Notes |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | PASS (committed) | Any new TS helper (findings-context / lift glue) is written test-first. The YAML/manifest wiring is exercised by an integration smoke, not unit tests. No spike kept as production code. |
| II. Integration-first, no speculative building | PASS | This slice IS the integration-first move — derived from the real Spec Kit install, not an imagined provider. No normalized-manifest machinery built speculatively (explicitly out of scope, FR-008). |
| III. Branch on capabilities, never provider identity | PASS | The governance command operates on the diff/plan; FR-003 + SC-003 forbid any provider-name branch. Verified by a grep gate over the command's code path. |
| IV. Division of labor | PASS | Spec Kit executes (`/speckit-implement`); deskwork governs. Governance never writes back into Spec Kit artifacts. |
| V. No fallbacks / no mock data | PASS | The command throws if `dw-lifecycle audit-barrage` is unavailable rather than faking a run. |
| VI. Strict typing & composition | PASS | New TS uses interfaces, no `any`/`as`/`@ts-ignore`; files kept small. |
| VII. Commit & push early/often | PASS | One logical change per commit; no AI attribution. |
| VIII. Faithful tool adoption | PASS | Built by walking Spec Kit's native flow in order (constitution → specify → clarify → plan → …). |

**No violations.** Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-speckit-backhalf-slice/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (extension + command + finding contracts)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
.specify/extensions/deskwork-governance/      # the Spec Kit extension (local, installed via --dev)
├── extension.yml                             # provides.commands + hooks.after_implement
├── commands/
│   └── speckit.deskwork.govern.md            # command body (Claude skill): gather diff → barrage → lift
├── scripts/
│   └── bash/govern.sh                        # orchestration: git diff → audit-barrage-render → audit-barrage → lift
└── README.md

plugins/dw-lifecycle/                          # deskwork side (only if a thin helper is needed)
├── src/governance-bridge/                     # NEW (only if needed): diff-context assembly / lift glue
│   └── <helper>.ts
└── src/__tests__/governance-bridge/           # NEW: vitest tests (test-first)

scripts/
└── smoke-governance-after-implement.sh        # NEW: local integration smoke (install --dev, stub implement, assert)
```

**Structure Decision**: The extension lives under Spec Kit's own convention (`.specify/extensions/<name>/`) and is installed locally with `specify extension add .specify/extensions/deskwork-governance --dev`. It mostly orchestrates *existing* `dw-lifecycle` verbs via a bash script invoked from the command body. Net-new deskwork TypeScript is added only if the diff-context assembly or findings-lift can't be done by composing existing verbs in bash; if added, it lands under `plugins/dw-lifecycle/src/governance-bridge/` with tests first. The local integration smoke lives in `scripts/` (not CI).

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
