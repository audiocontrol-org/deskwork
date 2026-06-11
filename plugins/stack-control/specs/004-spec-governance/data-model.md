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

### Gate decision (the protocol port — R3/R4; reshaped #432)
Output of `stackctl spec-governance-gate`; a **single boolean** the consumer obeys (policy in exactly one place — #432).
- **stdout**: `true` (gate OPEN — may graduate) or `false` (BLOCKED). Nothing else.
- **exit code**: execution status, NOT policy — `0` evaluated successfully (read stdout), `2` fatal / could-not-evaluate (FR-005).
- The decision: OPEN iff the **dampener is engaged** (FR-010, computed on **raw-surfaced** severity over the recent run(s)) OR an **override** (`--override "<reason>"`, mandatory reason recorded to stderr) is supplied. There is no `state`/`rule`/`openHigh`/`ceiling` field — those let a consumer re-derive policy.
- Loop bounding (the FR-014 ceiling, `non-converged` escalation) is the **loop driver's** responsibility, not the gate's — the gate returns only the convergence boolean.

### GovernanceRun (iteration set)
The sequence of barrage iterations for one spec graduation attempt.
- `slug`, `checkpoint`, `runDirs: string[]` (one per iteration), and the per-run gate decision (OPEN/BLOCKED).
- Invariant (enforced by the loop driver, FR-014): terminates in exactly one of converged (gate OPEN) | overridden | non-converged-at-ceiling (never open-ended) — SC-008.

## Relationships

```
SpecGovernanceCheckpoint --fires--> BarrageRun (1..ceiling) --lifts--> Finding[] --> audit-log
                                          |                                  |
                                          +----> GovernanceRun.runDirs       +--> gate decision (dampener over what RECENT runs raw-surfaced)
loop driver --consumes--> gate boolean --gates--> spec graduation (next Spec Kit step); --bounds--> ceiling (FR-014)
```

## Validation rules (from requirements)

- A spec MUST NOT graduate unless the gate prints `true` (dampener engaged or override) — FR-010 / SC-007.
- The FR-014 ceiling MUST be enforced by the loop driver (the gate emits no `non-converged` state) — SC-008; no unbounded loop.
- An override MUST record a reason and be durable in the run record (FR-010).
- If the audit capability is absent, no decision is produced — the flow fails loud (FR-005, exit 2); a spec is never recorded as governed (SC-003).
- Degraded coverage (missing model families) is recorded on the `BarrageRun`, never presented as full (FR-008).
