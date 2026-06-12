# Phase 1 Data Model: Audit-protocol convergence correctness + incremental audit units

Entities and the loop-driver state machine. Types are TypeScript-strict (no `any`/`as`/`@ts-ignore`); fields below name the data, not the wire format.

## Entity: PerLaneSeverity

The severity one covering lane assigned to a finding it raised.

| Field | Type | Notes |
|-------|------|-------|
| `model` | `string` | the lane's pinned model id (e.g. `opus`, `gpt-5.5`) |
| `severity` | `NormalizedSeverity` | `blocking \| high \| medium \| low \| informational` (existing rank) |

## Entity: ClusterSeverityDecision (NEW — D1/D3)

The record of how a cross-lane cluster's gate-counted severity was derived. Persisted at lift (FR-002).

| Field | Type | Notes |
|-------|------|-------|
| `perLane` | `PerLaneSeverity[]` | every covering lane's raw severity for the cluster |
| `rule` | `'single-model' \| 'agreement' \| 'adjudicated'` | which mechanism produced the result |
| `gateCountedSeverity` | `NormalizedSeverity` | what the dampener will count (the single `Severity:` line) |
| `adjudicationBasis` | `string \| undefined` | present iff `rule === 'adjudicated'`; the recorded blast-radius/reachability/fix-debt basis (D2) |

**Derivation rules**:
- `perLane.length === 1` → `rule = 'single-model'`, `gateCountedSeverity = perLane[0].severity` (004 FR-003 preserved).
- `perLane.length >= 2` → `rule = 'agreement'`, `gateCountedSeverity =` highest level at which ≥2 lanes rate at-or-above (D1).
- A finding routed through adjudication (single-lane consistency-seam / fix-debt) → `rule = 'adjudicated'`, severity + basis from D2.

**Validation**: `gateCountedSeverity` MUST be ≤ `max(perLane.severity)` (de-inflation never *raises* severity) and, for `agreement`, MUST be the agreement level (a seeded ≥2-lane HIGH MUST stay `high`/`blocking`).

## Entity: ExtractedFinding (MODIFIED)

The lift's per-finding record gains the per-lane inputs and the decision.

| Field | Type | Change |
|-------|------|--------|
| `heading`, `surface`, `body` | `string` | unchanged |
| `severity` | `NormalizedSeverity` | now `= ClusterSeverityDecision.gateCountedSeverity` (was `max(SEVERITY_RANK)`) |
| `sourceModels` | `string[]` | unchanged |
| `crossModelAgreement` | `boolean` | unchanged (`sourceModels.length >= 2`; existence, orthogonal to severity) |
| `perLaneSeverities` | `PerLaneSeverity[]` | **NEW** |
| `severityDecision` | `ClusterSeverityDecision` | **NEW** |

The audit-log entry written for this finding carries the gate-counted `Severity:` line (dampener contract unchanged) plus a recorded per-lane breakdown + decision rule (auditability, SC-002).

## Entity: AuditUnit (NEW — D6)

The bounded scope of one barrage payload.

| Field | Type | Notes |
|-------|------|-------|
| `granularity` | `'phase' \| 'feature'` | `phase` for incremental (FR-007); `feature` for the composing whole-feature pass |
| `phaseId` | `string \| undefined` | the tasks.md phase header id (present iff `granularity === 'phase'`) |
| `diffScope` | `DiffScope` | the commits/files this unit audits (a phase's produced diff, or the changed+cross-cutting set for the composing feature pass) |
| `auditLogSection` | `string` | the append-only section this unit's findings are recorded under |

**Composition rule (FR-008)**: a `feature`-granularity unit's `diffScope` excludes any phase whose code is unchanged since that phase's unit-audit reached `converged` (carried), and includes changed + cross-cutting code.

## Entity: ConvergenceOutcome (NEW — D4)

The terminal result of one convergence-loop attempt over an `AuditUnit`. Discriminated union.

| Variant | Fields | Meaning |
|---------|--------|---------|
| `converged` | `rounds: number` | the gate returned OPEN; the unit may graduate |
| `non-converged` | `rounds: number`, `ceiling: number` | the ceiling was reached without OPEN (bounded termination, FR-014) |

**Invariant**: every loop attempt ends in exactly one variant; the loop NEVER returns control without one (SC-004, deterministic termination).

There is **no `overridden` driver terminal** (AUDIT-20260612-05). An operator `--override` is routed through the **gate**, not the driver: the gate records the reason in the audit trail and returns OPEN, so an overridden run reaches the driver as a normal `converged` pass **with a barrage record** — a driver-level short-circuit would have skipped that record. The driver therefore drives passes only; it does not carry the `AuditUnit` (findings are recorded by the lift, not the loop).

## State Machine: convergence loop driver (D4)

States of one `convergence-loop` run:

```text
        ┌─────────────────────────────────────────────────────┐
        │                                                       │
   START ──▶ RUN-PASS ──▶ READ-GATE ──┬─ OPEN ─────────▶ converged  (terminal)
        ▲       │                      │
        │       │                      ├─ BLOCKED & rounds<ceiling ─▶ DISPATCH-FIX ─┐
        │       │                      │        (agent's only in-loop action)       │
        │       │                      └─ BLOCKED & rounds==ceiling ─▶ non-converged │ (terminal)
        │       │                                                                    │
        └───────┴────────────────────────────────────────────────────────────────┘
                         (DISPATCH-FIX returns → RUN-PASS, rounds += 1)
```

- **RUN-PASS** = one `render → barrage → lift → slush → gate` protocol pass (the existing chain, now behind a step API the driver calls).
- **READ-GATE** consumes the gate's single OPEN/BLOCKED boolean — the driver never re-derives policy.
- **DISPATCH-FIX** is the only state where the agent acts (fix the surfaced findings); the iterate/stop transition is the driver's, not the agent's.
- The ceiling is caller-supplied, counted in `rounds`: FR-014's per-checkpoint convergence ceiling is **5** (the autonomous-loop target), but `govern` currently passes **1** — it applies no in-process fix between rounds, so a higher ceiling would only re-barrage an unchanged tree (AUDIT-20260612-03/-04). The cross-round loop (fix → re-invoke govern) is agent-paced until a real in-process fixer lands.
- A recorded override (`GOVERN_OVERRIDE` / `--override`) is handled by the gate (returns OPEN → `converged` with a record), NOT a driver short-circuit (AUDIT-20260612-05).

## Relationships

- An `AuditUnit` is governed by exactly one `convergence-loop` run, producing one `ConvergenceOutcome`.
- A `feature`-granularity `AuditUnit` composes from the set of `phase`-granularity units that already reached `converged` (D6/FR-008).
- Each `RUN-PASS` produces a barrage lift section containing `ExtractedFinding`s, each carrying a `ClusterSeverityDecision`.
- The dampener (unchanged) reads the gate-counted `Severity:` lines that the `ClusterSeverityDecision`s populated.
