# Implementation Plan: Audit-protocol convergence correctness + incremental audit units

**Branch**: `feature/audit-protocol` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-audit-protocol-convergence/spec.md`

## Summary

Make the cross-model audit-barrage convergence loop **mechanically terminate** and shrink the **unit of work** it audits. Five threads over the existing barrage/govern module family: (1) replace the lift's **max-of-cluster** severity with a **cross-lane severity-agreement** computation (a cluster is gate-counted HIGH only when ≥2 covering lanes rate it HIGH; single-model findings keep their severity per 004 FR-003), preserving per-lane severities on disk, plus an **adjudication pass** that re-scores residual single-lane inflations on blast-radius/reachability/fix-debt — so the dampener's two-consecutive-raw-0-HIGH branch becomes reachable; (2) lift the convergence loop out of skill-body prose into a **code loop driver** that owns the iterate/stop decision and the FR-014 iteration ceiling, consuming the gate's single OPEN/BLOCKED boolean; (3) **exclude the unit's own audit-log** and unrelated parked scaffolds from the rendered payload; (4) add a **per-phase incremental audit** boundary (a completed tasks.md phase / user-story slice is an audit unit) whose whole-feature `after_implement` pass composes from already-converged phases; (5) **re-calibrate sonnet** on the smaller per-phase payloads under mechanical read-only and admit it to an operator-selectable override profile when it meets a recorded latency/depth/on-task bar. A regression test pins the already-correct #432 raw-counting (Facet A). All design decisions in [research.md](./research.md) (D1–D8); entities + the loop-driver state machine in [data-model.md](./data-model.md); the gate/severity/loop/unit contracts in [contracts/](./contracts/).

## Technical Context

**Language/Version**: TypeScript (strict), Node ≥ 20, run via `tsx` (no build step; in-tree plugin convention)

**Primary Dependencies**: existing barrage + govern modules (`src/scope-discovery/audit-barrage/*`, `src/scope-discovery/promote-findings/*`, `src/govern/*`, `src/subcommands/{govern,spec-governance-gate,slush-findings}.ts`); `node:child_process` (already used by the loop driver's barrage spawns); `yaml` (config). No new external dependencies.

**Storage**: filesystem — the append-only per-feature audit-log (existing) gains a per-lane-severity record per finding; barrage run artifacts under `.stack-control/audit-runs/` (existing); the loop driver records a per-attempt convergence outcome.

**Testing**: Vitest (`npm --workspace @deskwork/plugin-stack-control test`), tmp-dir fixture audit-logs and run-dirs (never mocked fs); a stub gate/barrage for the loop-driver timing/termination tests; the 014 hostile-write-probe harness reused for the sonnet read-only assertion (SC-007).

**Target Platform**: macOS/Linux dev machines (same as the current barrage)

**Project Type**: in-tree plugin CLI (`plugins/stack-control`, single-dispatcher `stackctl`)

**Performance Goals**: a per-phase payload that puts the slowest *admitted* lane under its derived timeout with the 014 margin (SC-006); no added latency on the existing whole-feature path when incremental units are not used.

**Constraints**: dw-lifecycle barrage copy untouched (succession isolation); the dampener's branch definitions (004 FR-010) are unchanged — only severity *computation* (thread 1) and *who drives the loop* (thread 2) change; files ≤ 300–500 lines (split new modules rather than grow `extract-barrage-findings.ts` / `protocol.ts`); no `any`/`as`/`@ts-ignore`.

**Scale/Scope**: 2 active lanes today (claude/opus, codex/gpt-5.5), config supports N; whole-feature payloads observed to 256 KB budget, per-phase target an order of magnitude smaller.

## Constitution Check

*GATE: evaluated pre-Phase-0 and re-checked post-Phase-1 — PASS (no violations; Complexity Tracking empty).*

- **I. Test-First (NON-NEGOTIABLE)**: every behavior lands RED-first. The severity-agreement computation, the loop-driver termination, the payload exclusion, the per-phase scoping, and the Facet-A guard each get a failing Vitest first. The sonnet calibration is an *experiment* (recorded evidence), not production code — its only shipped artifact is a config lane + the hostile-probe test (RED-first).
- **II. Integration-First**: thread 1 is derived from the **two concrete lanes** (claude, codex) and the real 014 rounds-4–7 finding stream — not an imagined fleet. Thread 4's per-phase unit is derived from the real tasks.md phase grammar. No scope cuts beyond the operator-clarified forks (FR-001/007/011).
- **III. Capability, not provider**: the severity-agreement and loop driver branch on **declared coverage / per-lane severity**, never on a binary name; the sonnet lane is "claude-shaped" by its config (stream-json + plan-mode), not by identity. Adjudication consumes per-lane severities, not model names.
- **IV. Division of Labor**: entirely within stack-control's governance substrate; no provider artifact is written.
- **V. No Fallbacks**: a below-quorum cluster (one covering lane) does NOT silently downgrade a HIGH (004 FR-003 preserved); the adjudication pass fails loud if its inputs (per-lane severities) are absent; an unadmitted model is declared out of the fleet, never assumed-clean.
- **VI. Strict Typing & Composition**: new `ClusterSeverityDecision` record + `ConvergenceOutcome` discriminated union; new modules (`cluster-severity.ts`, `adjudicate-findings.ts`, `convergence-loop.ts`, `incremental-audit.ts`) keep `extract-barrage-findings.ts` and `protocol.ts` under the line cap.
- **VII. Commit & Push Early and Often**: per-task commits, no attribution, pushed at each task boundary to `feature/audit-protocol` (session-pinned).
- **VIII. Faithful Tool Adoption**: specify → clarify (done) → plan (this) → tasks → analyze → implement, in Spec Kit order.
- **IX. Execution-Backend Pluggability**: the loop driver is the in-session execution backend for the convergence loop; it selects barrage spawns by capability, and the per-phase unit boundary is backend-agnostic.

## Project Structure

### Documentation (this feature)

```text
specs/015-audit-protocol-convergence/
├── spec.md
├── checklists/requirements.md
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D8
├── data-model.md        # Phase 1 — entities & the loop-driver state machine
├── contracts/
│   ├── cluster-severity.md       # severity-agreement + adjudication contract (thread 1)
│   ├── convergence-loop.md       # loop-driver verbs + outcomes (thread 2)
│   └── incremental-audit.md      # per-phase unit boundary + payload-exclusion (threads 3/4)
├── quickstart.md        # Phase 1 — SC-001..008 validation runbook
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/scope-discovery/promote-findings/
│   ├── extract-barrage-findings.ts   # MODIFIED: mergeCluster delegates severity to cluster-severity.ts;
│   │                                 #   ExtractedFinding gains perLaneSeverities[]
│   ├── cluster-severity.ts           # NEW: cross-lane severity-agreement computation (thread 1A)
│   ├── adjudicate-findings.ts        # NEW: residual single-lane re-score on blast-radius/reachability/
│   │                                 #   fix-debt → calibrated gate severity + basis (thread 1C)
│   └── check-barrage-dampener.ts     # UNCHANGED behavior; covered by the Facet-A regression guard (FR-010)
├── src/govern/
│   ├── protocol.ts                   # MODIFIED: single-pass chain extracted behind a step API the
│   │                                 #   loop driver calls; payload render excludes own audit-log (thread 3)
│   ├── convergence-loop.ts           # NEW: code loop driver — rounds, ceiling, ConvergenceOutcome (thread 2)
│   ├── payload-implement.ts          # MODIFIED: drop the audit-log-excerpt fold; bound untracked fold (thread 3)
│   └── incremental-audit.ts          # NEW: per-phase unit resolution (tasks.md phase → diff scope) (thread 4)
├── src/subcommands/
│   ├── govern.ts                     # MODIFIED: delegate the loop to convergence-loop.ts (no agent-held loop)
│   ├── spec-governance-gate.ts       # UNCHANGED (still emits the single OPEN/BLOCKED boolean)
│   └── audit-barrage-lift.ts         # MODIFIED: persist per-lane severities + the ClusterSeverityDecision
├── templates/audit-barrage-config.yaml   # MODIFIED: sonnet override-profile lane (commented, FR-011)
├── .stack-control/audit-barrage-config.yaml  # MODIFIED only if operator activates the sonnet profile
└── src/__tests__/scope-discovery/...     # NEW/MODIFIED: RED-first suites per thread
```

**Structure Decision**: everything stays inside the existing `plugins/stack-control` barrage/govern module family; four new single-purpose modules keep the two largest touched files (`extract-barrage-findings.ts`, `protocol.ts`) under the size cap. No dw-lifecycle path is touched (succession isolation). The dampener's branch logic is not modified — only the severity it counts (upstream, in the lift) and who drives the re-run loop (downstream, the new driver).

## Complexity Tracking

No constitution violations — table intentionally empty.
