# Contract: `stackctl spec-governance-gate` verb

The convergence gate. It owns the FR-010 graduation **policy in exactly one place** and returns a single decision the consumer **obeys** — never a richer output an agent re-interprets (#432, operator directive 2026-06-08). Lives at `plugins/stack-control/src/subcommands/spec-governance-gate.ts`.

## Invocation

```
stackctl spec-governance-gate --feature <slug> [--override "<reason>"] [--checkpoint <name>]
```

- `--feature <slug>` (required) — the feature whose `audit-log.md` history is evaluated.
- `--override "<reason>"` (optional) — forces the gate OPEN; the reason is mandatory and recorded (to stderr) (FR-010).
- `--checkpoint <name>` (optional) — scope evaluation to one checkpoint's runs (FR-011).
- `--ceiling <N>` / `--json` — **accepted but ignored** (back-compat): loop bounding moved to the loop driver (FR-014), and the output is always the bare boolean.

## Behavior (the policy — FR-010, in exactly one place)

The gate is **OPEN** when the FR-010 dampener is engaged OR an explicit `--override` is supplied. The dampener engages when EITHER:
- **Branch (a)**: the most recent barrage run **SURFACED 0 HIGH/BLOCKING AND 0 MEDIUM** (a genuinely-pristine run); OR
- **Branch (b)**: the last **2 consecutive** barrage runs each **SURFACED 0 HIGH/BLOCKING**.

"Surfaced" = **raw severity by `Severity:` line, regardless of later `Status:`** (#432). A run that surfaced a HIGH then had it fixed is NOT a 0-HIGH run. The **count of still-open findings has NO bearing** — there is no cross-run open-finding union gate (operator directive; reverses AUDIT-20260607-45). Otherwise the gate is **BLOCKED**.

## Output — a single boolean

`stdout` is **only** `true` (gate OPEN — may graduate) or `false` (BLOCKED). Nothing else is printed to stdout, so a caller reads exactly one token. Human context + the override reason go to **stderr**.

## Exit codes (execution status, NOT policy)

- `0` — the gate **evaluated successfully** (read stdout for OPEN/BLOCKED — both exit 0).
- `2` — fatal / **could-not-evaluate** (feature/audit-log not found; capability absent — fail loud, FR-005, no decision printed).

There is **no exit-1-means-blocked**: blocked is a normal, successful evaluation that prints `false`.

## Contract assertions (these become the RED-first tests)

1. Given a most-recent run that surfaced 0 HIGH + 0 MED → stdout `true`, exit 0.
2. Given two consecutive runs each surfacing 0 HIGH (a MED present) → stdout `true`, exit 0.
3. Given a most-recent run that surfaced ≥1 HIGH → stdout `false`, exit 0 (blocked is not an error).
4. Given a single run that surfaced a HIGH later fixed → stdout `false` (raw-surfaced counting; #432).
5. Given an earlier run's open HIGH the last two runs did NOT re-surface → stdout `true` (open findings have no bearing; #432).
6. Given `--override "<reason>"` on an otherwise-blocked run → stdout `true`, reason recorded to stderr, exit 0.
7. Given a missing audit-log / absent capability → exit 2, no boolean on stdout, no "governed" claim (SC-003).
8. The decision MUST match `check-barrage-dampener`'s engage decision on identical input (port fidelity — Principle VIII): the same function, not a hand-retyped approximation.
