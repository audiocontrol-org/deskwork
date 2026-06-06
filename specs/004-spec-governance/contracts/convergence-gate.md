# Contract: `stackctl spec-governance-gate` verb

The protocol port (R3/R4). Turns the per-feature barrage run history into a **graduation verdict** by reusing the dw-lifecycle convergence logic (`check-barrage-dampener` Rule A/Rule B). Lives at `plugins/stack-control/src/subcommands/spec-governance-gate.ts`.

## Invocation

```
stackctl spec-governance-gate --feature <slug> [--ceiling <N>] [--override "<reason>"] [--json]
```

- `--feature <slug>` (required) — the feature whose `audit-log.md` + `audit-runs/` history is evaluated.
- `--ceiling <N>` (optional, default from config) — max iterations before `non-converged` (FR-014).
- `--override "<reason>"` (optional) — records an explicit override; reason is mandatory if used (FR-010).
- `--json` — emit the `ConvergenceVerdict` as JSON (default: human summary + JSON to stdout).

## Behavior (criterion — ported verbatim from `check-barrage-dampener`)

The gate is **satisfied** (`state = converged`) when EITHER:
- **Rule B (single-run-clean)**: the most recent barrage run has **0 open HIGH (or BLOCKING) AND 0 open MEDIUM** findings; OR
- **Rule A (n-consecutive-quiet)**: the last **2 consecutive** barrage runs each have **0 open HIGH (or BLOCKING)** findings.

Otherwise `state = blocked`, unless `iterations >= ceiling` → `state = non-converged` (escalate), or `--override` supplied → `state = overridden` (reason recorded).

## Output (`ConvergenceVerdict`)

```json
{
  "feature": "spec-governance",
  "state": "converged | blocked | non-converged | overridden",
  "rule": "single-run-clean | n-consecutive-quiet | none",
  "iterations": 2,
  "ceiling": 5,
  "openHigh": 0,
  "openMedium": 0,
  "override": { "recorded": false }
}
```

## Exit codes

- `0` — `converged` or `overridden` (spec MAY graduate).
- `1` — `blocked` or `non-converged` (graduation refused; actionable — fix findings & re-barrage, or record an override).
- `2` — fatal (feature/audit-log not found; capability absent — fail loud, FR-005).

## Contract assertions (these become the RED-first tests)

1. Given a latest run with 0 HIGH + 0 MED open findings → `state=converged`, `rule=single-run-clean`, exit 0.
2. Given two consecutive runs each with 0 HIGH (but a MED present) open findings → `state=converged`, `rule=n-consecutive-quiet`, exit 0.
3. Given a latest run with ≥1 open HIGH and `iterations < ceiling` → `state=blocked`, exit 1.
4. Given `iterations >= ceiling` without convergence → `state=non-converged`, exit 1 (never loops).
5. Given `--override "<reason>"` on a blocked state → `state=overridden`, reason recorded, exit 0.
6. Given a missing audit-log / absent capability → exit 2, no verdict, no "governed" claim (SC-003).
7. The criterion result MUST match `check-barrage-dampener`'s engage decision on identical input (port fidelity — Principle VIII): the ported logic is the same function, not a hand-retyped approximation.
