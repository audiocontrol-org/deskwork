# Implementation Plan: govern-operability

**Branch**: `029-govern-operability` (on the long-lived `feature/stack-control`) | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/029-govern-operability/spec.md`; approved design record `docs/superpowers/specs/2026-06-19-govern-operability-design.md`.

## Summary

Burn down the entire `multi:feature/govern-operability` umbrella in one feature: make per-phase cross-model governance reliable, observable, deterministic, hygienic, correctly-scoped, granularity-flexible, O(n) on shared files, and process-disciplined — closing all 17 referenced backlog tasks + the two gap nodes. The work is **additive extension of existing surfaces** (specs/015 convergence loop + specs/021 hardening are shipped and are NOT re-implemented). Nine user stories = nine implementation phases in sharpen-the-saw build order (US1..US9): reliability/observability/determinism first (they make this feature's own per-phase govern bearable), then loop hygiene + payload correctness, then granularity + staleness structural fixes, then process discipline + hygiene. US5 and US7 are critical-path because per-phase stays the default (US6).

## Technical Context

**Language/Version**: TypeScript (ESM), run via `tsx`. Node ≥ 20.

**Primary Dependencies**: existing in-tree modules only — `scope-discovery/audit-barrage/*`, `scope-discovery/promote-findings/*`, `govern/*`, `workflow/*`, `subcommands/*`, `backlog/*`; vitest for tests; `js-yaml` for the barrage config; `git` (diff/hunk) for payload + fingerprint. No new external dependency.

**Storage**: governed markdown + YAML on disk — `templates/audit-barrage-config.yaml`, the installation `.stack-control/audit-barrage-config.yaml`, the audit-log, per-phase checkpoint records under the installation, the backlog store, `templates/WORKFLOW.md`. No database.

**Testing**: vitest unit + integration with on-disk fixtures (per `.claude/rules/testing.md` — never mock the filesystem). TDD-first (Constitution Principle I): RED test before each fix.

**Target Platform**: the stack-control plugin CLI (`stackctl`) + skill bodies; cross-vendor (Claude Code + Codex). Logic in `stackctl`, never vendor identity (Principle III/IX).

**Project Type**: single in-tree TypeScript plugin (not a packages/ shell — succession R1).

**Performance Goals**: governance *operability* outcomes (not throughput) — the loop converges within the bounded ceiling on clean code; an override fires zero barrage runs; a shared-file N-phase feature governs in O(n); the no-grounding fleet completes read-only within the timeout floor (sonnet validated 167–233s on 14–24KB).

**Constraints**: strict typing (no `any`/`as`/`!`/`@ts-ignore`); `@/` imports with `.js` suffix; files 300–500 lines (refactor larger); no fallbacks/mock-data outside tests — throw descriptive errors (Principle V); all stack-control-owned state anchored inside the installation.

**Scale/Scope**: ~9 phases touching ~20 existing source files + 2 template/config files + a few skill bodies; one new `backlog done` verb; ~17 backlog tasks closed.

## Constitution Check

*GATE: must pass before Phase 0; re-checked after Phase 1.*

- **I. Test-First (NON-NEGOTIABLE)**: PASS — every phase lands a RED test before the fix (each FR has an acceptance scenario that becomes a test). No spike kept.
- **II. Integration-First, No Speculative Building**: PASS — every change extends a real, exercised surface from the census; no imagined abstraction. Capture-don't-cut honored in the spec; scoping was the operator's explicit pass.
- **III. Branch on Capabilities, not Provider Identity**: PASS — US1 liveness/config and US2 observability branch on lane capability/terminal-state, never vendor name.
- **IV. Division of Labor**: PASS — this is the implementation session on the feature worktree; orchestration (define/approve) already done.
- **V. No Fallbacks, No Mock Data Outside Tests**: PASS — US1 removes a grounding tool-loop (not a fallback); degraded-fleet handling (US2) throws/surfaces rather than silently degrading; the override short-circuit records + graduates explicitly.
- **VI. Strict Typing & Composition**: PASS — US9 even removes existing `!` assertions; all new code strict-typed, files kept under cap.
- **VII. Commit & Push Early and Often**: PASS — commit + push at each phase boundary.
- **VIII. Faithful Tool Adoption**: PASS — authored through the full spec-kit chain in order; governed per-phase.
- **IX. Execution-Backend Pluggability**: PASS — fleet/liveness work keeps the capability port; no hard vendor dependency introduced.

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/029-govern-operability/
├── plan.md              # this file
├── research.md          # Phase 0 — decisions per user story
├── data-model.md        # Phase 1 — finding-signature, lane terminal state, checkpoint, override marker
├── quickstart.md        # Phase 1 — runnable validation per SC
├── contracts/           # Phase 1 — CLI/behavior contracts (govern --override, backlog done, gate either-of)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (installation root: `plugins/stack-control/`)

```text
src/
├── scope-discovery/
│   ├── audit-barrage/
│   │   ├── spawn-cli.ts            # US1 liveness window; US2 terminal-state taxonomy
│   │   └── run-artifacts.ts        # US2 INDEX/synthesis surfacing of degraded lanes
│   └── promote-findings/
│       ├── check-barrage-dampener.ts  # US3 identity-keyed + hysteresis; US2 quiet-run guard
│       ├── cluster-severity.ts        # US3 finding-signature source
│       ├── adjudicate-findings.ts     # US3 hysteresis input
│       └── extract-barrage-findings.ts# US3/US4 finding-signature (normalized-heading+file)
├── govern/
│   ├── convergence-loop.ts         # US4 override short-circuit (no pass on --override)
│   ├── convergence-types.ts        # US4 override outcome
│   ├── incremental-audit.ts        # US5 phase-commit union; US7 hunk scope
│   ├── payload-implement.ts        # US5 referenced-dep widening
│   ├── checkpoint-state.ts         # US7 hunk-granularity fingerprint
│   └── phase-checkpoint-status.ts  # US7 staleness eval
├── workflow/
│   └── gate-eval.ts                # US6 either-of graduate gate
├── subcommands/
│   ├── govern.ts                   # US4 override route; US5 diff-base union
│   ├── audit-barrage-lift.ts       # US2 degraded surfacing; US4 never-lift-fixed + dedup
│   ├── slush-findings.ts           # US4 defer-to-terminal + skip-fixed
│   └── roadmap.ts                  # US9 list-flag guard + dead branch
└── backlog/                        # US4 new `done`/close verb + auto-reconcile

templates/
├── audit-barrage-config.yaml       # US1 no-grounding default + timeout floor + codex liveness
└── WORKFLOW.md                     # US6 either-of gate semantics

skills/ (audit/implement + roadmap SKILL.md) # US8 process drivers; US9 cluster doc; tooling-feedback
tests/                              # RED-first per phase; tests/roadmap/cluster.test.ts (US9 `!` removal)
```

**Structure Decision**: extend the existing single-project in-tree layout; no new top-level modules. The one net-new surface is a `backlog done`/close verb (US4 FR-015).

## Complexity Tracking

No constitution violations — section intentionally empty.
