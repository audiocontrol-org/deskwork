# Spec-audit diminishing returns — detect the plateau, don't chase the generator

> **STATUS (operator decision 2026-06-16): spec audit-barrage is PARKED from the default workflow.** `stackctl govern --mode spec` is **not a default/required step** until the spec-audit protocol's kinks are worked out — it is **opt-in only**. Implementation audit-barrage (the `after_implement` deskwork-governance hook) is **unchanged and stays required**. The guidance below still applies whenever spec governance IS run deliberately, but do not treat running it as a default expectation in the lifecycle. Re-enabling it as a default-required gate is tracked as **TASK-138**; the `022 parseable-lifecycle-workflow` design reflects the park (spec-govern gate opt-in; `specifying→implementing` defaults to `speckit-analyze`-clean; the symmetric convergence-record mechanism is retained for cheap re-enable).

When running the cross-model audit-barrage against a **spec** (`stackctl govern --mode spec` — the spec-governance convergence loop), the hard part is **knowing when to stop**. Code-audit convergence is crisp (0 findings = clean). Spec-audit has **no such floor**: a spec is prose, inherently incomplete, so an aggressive cross-model barrage can always find another under-specified edge. Detecting diminishing returns is genuinely fuzzy — and getting it wrong means burning barrage cycles feeding a finding *generator* instead of converging.

## The rule

1. **The catalog + log is canonical.** Read [`plugins/stack-control/spec-kit/spec-governance/SPEC-AUDIT-FAILURE-MODES.md`](../../plugins/stack-control/spec-kit/spec-governance/SPEC-AUDIT-FAILURE-MODES.md) before/while driving a spec-governance loop, and **append a new entry after each substantial spec audit** (trajectory, failure modes observed, what broke the plateau, outcome). The log is where the discipline compounds; this rule is the always-loaded pointer to it.

2. **Watch for the plateau.** You are likely at diminishing returns when ≥2 hold across consecutive rounds: HIGH count stops monotonically decreasing (plateaus/oscillates); a meaningful fraction of new findings are **fix-debt** (consequences of the prior round's edits); a **root issue resurfaces** under a new finding ID; findings **shift altitude** from contradiction/promise-level down to implementation-mechanism-level (the spec is being asked to *be the code*).

3. **At the plateau, STOP patching instances** (the 004-dogfood lesson against chasing a generator). Do one of: **(A) structural root-fix** — remove the generator, don't feed it (de-specify an over-specified mechanism → state the *promise* + defer the protocol to `plan`/`contracts`+TDD; or DRY-collapse a rule restated in N places); **(B) override & graduate** — record a substantive `GOVERN_OVERRIDE` when the residual findings are all implementation-altitude and the spec already captures the promises + decisions. **Do NOT** just raise the ceiling and keep patching.

4. **The "promises before mechanism" line is the most common spec-audit generator.** If the barrage keeps rejecting prose attempts to fully specify an implementation mechanism (write protocols, crash-safety, parser internals), that is the signal to move the mechanism *out* of the spec — state what the operator is promised, and let RED tests pin the mechanism. A single such structural fix can collapse many findings at once (field-proven: `design/document-primitives` HIGH dropped 5→1 in one round when the two-file-atomicity mechanism was replaced with a promise).

5. **Operator owns the (A)-vs-(B) call and any genuine design forks** the plateau surfaces. Cross-model agreement is still the HIGH-confidence signal — a multi-model finding at the plateau is almost always a real deep tension, not noise.

## How to apply

- Before raising the ceiling or continuing a spec-governance loop another round, ask: *am I converging, or feeding a generator?* Check the plateau heuristics (§2) and the log's catalog.
- When you detect FM-2 (mechanism-over-specification), reach for the structural fix (§3A), not another patch.
- After the loop closes (converged or overridden), append the entry to the log so the next spec audit inherits the lesson.

## Why this rule exists

Written 2026-06-07 during the first self-hosted spec-governance dogfood (`design/document-primitives`, specs/005). The barrage's HIGH count went `7→5→2→1→5→5→1`: it plateaued because the spec was trying to specify a crash-safe two-file write protocol in prose (a mechanism a prose spec cannot carry), and each patch resurfaced the same impossibility (AUDIT-29→39→40). Patching instances could not converge it; a structural root-fix (replace mechanism with a promise, defer to TDD) dropped HIGH 5→1 in one round. The operator's framing: *"It's clearly harder and fuzzier to determine when you've hit the diminishing-returns plateau than when auditing code. We should be keeping a log… of our discoveries."* This rule + the log are that mechanism.
