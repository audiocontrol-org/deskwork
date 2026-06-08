# Quickstart: validating `design/spec-governance`

Runnable validation scenarios that prove the feature works end-to-end. References `contracts/` and `data-model.md` rather than restating them. Implementation details live in `tasks.md`.

## Prerequisites

- The `stack-control` plugin loaded; `dw-lifecycle` on PATH (the in-house barrage capability, FR-006); `git`, `jq`.
- At least one model-family CLI installed (e.g. `claude`); two or more to exercise cross-model agreement (FR-003/SC-002).
- A feature with a `spec.md` (this very feature is a valid target — see "Dogfood" below).

## Scenario 1 — Automatic governance at `after_clarify` (US1 / SC-001)

1. Drive a spec through `/speckit-clarify`. The `after_clarify` hook fires `speckit.spec-governance.govern-spec` automatically.
2. **Expected**: a barrage run-dir appears under `.dw-lifecycle/scope-discovery/audit-runs/<ts>-<slug>/`; findings are lifted into the feature `audit-log.md`; **no manual barrage command was issued**.
3. **Verify**: the run record exists and the audit-log gained a dated lift section (SC-001).

## Scenario 2 — Cross-model HIGH-confidence + triage (US2 / SC-002)

1. Seed the spec with a contradiction obvious enough that ≥2 model families flag it.
2. Run the governance hook.
3. **Expected**: the merged finding shows `crossModelAgreement` (HIGH confidence) and is distinguishable from single-model findings in the audit-log; each finding carries a disposition slot.
4. **Verify**: grep the audit-log section for the cross-model finding-id annotation (e.g. `claude-0x + codex-0y; cross-model`).

## Scenario 3 — Convergence gate blocks then opens (FR-010 / SC-007)

1. On a spec whose most-recent run surfaced a HIGH, run `stackctl spec-governance-gate --feature <slug>`.
2. **Expected**: stdout `false` (BLOCKED), exit 0 (evaluated — blocked is not an error) — the spec may not graduate.
3. Fix the spec, re-run the governance hook (iteration 2), then the gate.
4. **Expected**: when the latest run surfaced 0 HIGH + 0 MED → stdout `true`, exit 0; OR after two consecutive 0-HIGH runs → stdout `true`, exit 0. ("Surfaced" = raw `Severity:`, ignoring later `Status:` — #432.)

## Scenario 4 — Bounded non-convergence (FR-014 / SC-008)

1. With `--ceiling 2`, drive a spec whose findings keep recurring across iterations.
2. **Expected**: the **loop driver** stops after the ceiling iterations and escalates (records non-convergence) rather than looping forever. The gate itself only ever prints `true`/`false`; bounded termination is the driver's job, not the gate's (#432).

## Scenario 5 — Fail loud when capability absent (US3 / SC-003)

1. Remove the barrage capability from PATH (simulate), run the governance hook.
2. **Expected**: the script exits 2 with an actionable message; the spec is NOT recorded as governed; **zero silent skips**.
3. Partial: with only one of two model families available, the run records **reduced coverage** (never presented as full — FR-008).

## Scenario 6 — Override is recorded (FR-010)

1. On a `false` (BLOCKED) decision, run the gate with `--override "operator accepts residual finding X for reason Y"`.
2. **Expected**: stdout `true` (forced OPEN), exit 0, and the reason is recorded (to stderr).

## Dogfood (self-hosting)

`design/spec-governance` is itself a spec. Once the extension is built, the first real exercise is to govern **this** spec (and the `impl/execution-engine` spec, whose manual barrage motivated the feature) — closing the loop the thesis describes: the design-phase governance tool governing the design phase.

## Done When

All six scenarios pass on a real feature tree, and the gate's `true`/`false` decision matches `check-barrage-dampener`'s engage decision on identical input (port-fidelity assertion, `contracts/convergence-gate.md` #8).
