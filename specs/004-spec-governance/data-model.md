# Phase 1 Data Model: `design/spec-governance`

This feature is composition-heavy: most entities are **reused** from the dw-lifecycle audit-barrage (cited), not newly invented. New structure is limited to the convergence-gate verdict.

## Reused entities (from dw-lifecycle — do not redefine)

### Finding (`OpenFinding`)
Source: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/types.ts`. Reused as-is.
- `findingId` — e.g. `AUDIT-20260606-03`
- `heading`, `body`, `surface` (cited spec location), `lineNumber`, `auditLogPath`
- `severity`: `blocking | high | medium | low | informational` (normalized; empty → `medium`, non-canonical → `high`)
- cross-model agreement: a merged cluster carries `crossModelAgreement = sourceModels.length >= 2` → **HIGH confidence** (FR-003 / SC-002)
- **Disposition (Status)** state machine (reused): `open` → `fixed-<sha>` → `verified-<date>` | `acknowledged-<ref>` | `acknowledged-slush-pile-<date>` | `informational`

### Barrage run (`BarrageRun` / `ModelRunResult`)
Source: `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/types.ts`. One barrage invocation; per-model results (`exitCode`, `durationMs`, `stdoutBytes`, `stdoutPath`, `timedOut`, `spawnError`). Health predicate: `stdoutBytes > 0 && spawnError === undefined`. Run dir: `.dw-lifecycle/scope-discovery/audit-runs/<YYYYMMDDTHHMMSSsssZ>-<slug>/` with `INDEX.md`, `PROMPT.md`, `<model>.md`, `stderr/<model>.txt`. Reused as-is.

### Audit-log
The per-feature `docs/1.0/001-IN-PROGRESS/<slug>/audit-log.md` (FR-007 findings home, R6). Reused as the canonical, durable finding record across iterations.

## New entities (this feature)

### SpecGovernanceCheckpoint
The definition-time moment the barrage fires.
- `hook`: `after_clarify` (default) | `after_plan` (configurable) — FR-011
- `enabled`: bool (per-project config)
- `artifacts`: `[spec]` for `after_clarify`; `[spec, plan]` for `after_plan` — FR-013
- Validation: at least `after_clarify` MUST be enabled (the feature is inert otherwise); `after_specify` is not an allowed default.

### ConvergenceVerdict (the protocol port — R3/R4)
Output of `stackctl spec-governance-gate`; the graduation decision.
- `state`: `converged | blocked | non-converged | overridden`
- `rule`: which criterion engaged — `single-run-clean` (Rule B: 0 HIGH + 0 MED in the latest run) | `n-consecutive-quiet` (Rule A: 0 HIGH across the last 2 runs) | `none`
- `iterations`: count of barrage runs in this graduation attempt
- `ceiling`: configured max iterations (FR-014)
- `openHigh`, `openMedium`: counts of open findings at the gate evaluation
- `override`: `{ recorded: bool, reason?: string }` — required to graduate when not `converged` (mirrors `impl/execution-engine` FR-030)
- Transitions:
  - `blocked` → `converged` once Rule A or Rule B is satisfied on a subsequent run
  - `blocked` → `non-converged` when `iterations >= ceiling` without convergence (escalate; SC-008)
  - any non-`converged` → `overridden` only via an explicit recorded override

### GovernanceRun (iteration set)
The sequence of barrage iterations for one spec graduation attempt.
- `slug`, `checkpoint`, `runDirs: string[]` (one per iteration), `verdict: ConvergenceVerdict`
- Invariant: terminates in exactly one of `converged | overridden | non-converged` (never open-ended) — SC-008.

## Relationships

```
SpecGovernanceCheckpoint --fires--> BarrageRun (1..ceiling) --lifts--> Finding[] --> audit-log
                                          |                                  |
                                          +----> GovernanceRun.runDirs       +--> ConvergenceVerdict (reads open HIGH/MED across runs)
GovernanceRun --has-one--> ConvergenceVerdict --gates--> spec graduation (next Spec Kit step)
```

## Validation rules (from requirements)

- A spec MUST NOT graduate unless `ConvergenceVerdict.state ∈ {converged, overridden}` (FR-010 / SC-007).
- `non-converged` MUST be reachable within `ceiling` iterations (FR-014 / SC-008) — no unbounded loop.
- An override MUST record a reason and be durable in the run record (FR-010).
- If the audit capability is absent, no verdict is produced — the flow fails loud (FR-005); a spec is never recorded as governed (SC-003).
- Degraded coverage (missing model families) is recorded on the `BarrageRun`, never presented as full (FR-008).
