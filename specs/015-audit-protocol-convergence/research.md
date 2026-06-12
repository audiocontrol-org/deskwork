# Phase 0 Research: Audit-protocol convergence correctness + incremental audit units

All technical-context unknowns were resolved by the clarify session (FR-001/007/011) plus source-verified mechanics. No `NEEDS CLARIFICATION` remains. The decisions below (D1–D8) are the design rationale the plan, data-model, and contracts build on.

## D1 — Cross-lane severity-agreement replaces max-of-cluster (thread 1A; FR-001)

**Decision**: The lift computes a cluster's **gate-counted** severity by severity-agreement across the cluster's covering lanes, not `max(SEVERITY_RANK)`. Rule: the gate-counted severity is the highest level at which **≥2 covering lanes agree (rate it at-or-above that level)**. A **single-model** finding (one lane flagged it at all) keeps that lane's severity unchanged. Per-lane severities are recorded on the finding.

**Rationale**: Verified root cause of the 014 plateau — `mergeCluster` (`extract-barrage-findings.ts:262-266`) takes the max, so one lane's HIGH on a finding the other lane rated MEDIUM is gate-counted HIGH; the two-consecutive-raw-0-HIGH branch can never engage when each round emits one such inflation. Agreement-based counting de-inflates exactly that case (HIGH+MEDIUM → MEDIUM) while keeping a genuine ≥2-lane HIGH at HIGH (SC-003). It preserves 004 FR-003 (a single-model HIGH still blocks) by scoping de-inflation to *intra-cluster severity disagreement only*.

**Alternatives considered**: (i) keep max + gate-side plateau detector (FR-001 option B) — deferred to telemetry (D5); doesn't fix the mis-computed signal, only flags it. (ii) median/mode severity — less defensible than "≥2 agree" at the HIGH/MEDIUM boundary, and harder to state as a contract. (iii) min-of-cluster — over-suppresses; a real HIGH one lane caught and another missed (rated it absent, not lower) would be lost.

## D2 — Adjudication pass for residual single-lane inflations (thread 1C; FR-001)

**Decision**: A second-stage **adjudication pass** re-scores the findings D1 cannot resolve — single-lane findings on consistency-seam / prior-round fix-code — on three recorded signals: the finding's own **blast-radius** prose (self-assessed reachability/severity in the body), **reachability** through the public path, and **fix-debt** classification (is the finding about fix-code introduced by a prior round?). It emits a calibrated gate-counted severity with its basis recorded.

**Rationale**: D1 fixes clustered disagreement but not the 014 case where a *single* lane raised a HIGH whose own prose said "currently unreachable" / "genuinely low" (AUDIT-19/-21). Adjudication is the code-audit analog of the spec-audit diminishing-returns discipline: don't keep feeding a generator; re-score on the evidence already on disk (per-lane raw severities + the finding body). The basis is recorded so the decision is auditable (SC-002) and never silent (Constitution V).

**Alternatives considered**: a full meta-audit LLM synthesizer (roadmap `multi:gap/audit-barrage-metaaudit`) — larger surface, deferred; this feature's adjudication is a bounded re-score over on-disk evidence, not a new model spawn. Pure heuristic (fix-debt flag only) — insufficient; blast-radius/reachability are the signals the 014 findings actually carried.

## D3 — Per-lane severities persisted at lift (FR-002)

**Decision**: `ExtractedFinding` gains `perLaneSeverities: { model, severity }[]`; the lift writes them into the audit-log entry alongside the gate-counted `Severity:` line, and records the `ClusterSeverityDecision` (per-lane inputs + rule + result). The dampener still reads the single `Severity:` line (its contract is unchanged), now populated by D1/D2 instead of max.

**Rationale**: The investigation confirmed per-lane severities are discarded at merge today. D1/D2 and the auditability SCs (SC-002) require them on disk. Keeping the dampener's read-contract unchanged means thread 1 is upstream-only — the dampener and gate are not modified, minimizing blast radius (Constitution VI).

## D4 — Code loop driver owns iterate/stop + ceiling (thread 2; FR-004/005)

**Decision**: Extract `protocol.ts`'s single pass behind a step API; a new `convergence-loop.ts` driver runs rounds: each round = one protocol pass; after each, it reads the gate boolean; OPEN → terminate `converged`; BLOCKED → dispatch fix (the agent's only in-loop action) then re-run; at the configured ceiling → terminate `non-converged`; recorded override → terminate `overridden`. `govern.ts` delegates the loop to the driver instead of being a single pass the agent re-invokes.

**Rationale**: Verified that the loop is skill-body prose today — the agent is fixer and loop-controller. The thesis directive is *make failure states mechanically impossible*; a code driver that owns termination removes the agent's discretion over re-run/stop (SC-004) and enforces the FR-014 ceiling the gate explicitly delegated to the driver (004 FR-010/014, #432). The driver is unattended-safe (deterministic terminal in every branch) and never auto-edits the work.

**Alternatives considered**: gate emits a richer "keep-going" state — explicitly rejected by 004 #432 (the gate emits exactly one boolean; bounding moves to the driver). A shell loop in the govern skill — that IS the prose status quo; it's the failure mode.

## D5 — Plateau/diminishing-returns detector deferred to telemetry (FR-001 option B)

**Decision**: The gate-side plateau detector (HIGH count stops decreasing; fix-debt fraction rises; root issue resurfaces under a new ID) is **not** built as a primary mechanism in this feature. It is parked as a future **gate-reason telemetry** signal (a non-binding observation in the loop driver's per-round record).

**Rationale**: D1+D2 fix the mis-computed signal directly; a plateau detector on top of a *correct* signal is redundant for convergence and risks a second discretionary surface. Recording the trend as telemetry (not a gate input) keeps the option open without adding a competing stop mechanism now (operator's clarify call: B deferred).

## D6 — Per-phase incremental audit unit (thread 4; FR-007/008)

**Decision**: The audit unit is a completed **tasks.md phase** (which maps to a user-story slice, per the `## Phase N: User Story M` grammar). `incremental-audit.ts` resolves a phase → its diff scope (the commits/files that phase produced) and renders a unit-scoped payload through the same protocol/loop. The whole-feature `after_implement` governance **composes from converged phases**: it re-audits only code changed since a phase's unit-audit converged (changed + cross-cutting), carrying converged phases.

**Rationale**: Clarify decision. The phase grammar already exists in every tasks.md (verified in 014). Per-phase is the bounded payload that attacks the plateau (fewer findings/round), the fix-debt compounding, and the model-latency wall at once, while staying aligned with the spec structure (per-task = churn; per-commit = unaligned). Composition preserves the whole-feature safety net without full re-audit.

**Alternatives considered**: per-task (rejected — highest invocation count, cross-task-seam re-audit churn) and per-commit (rejected — variable, unaligned with spec structure), both in the clarify record.

## D7 — Payload excludes own audit-log + bounds untracked fold (thread 3; FR-006)

**Decision**: `payload-implement.ts` drops the `audit_log_excerpt` fold from the audited material (the barrage no longer sees the feature's own prior findings), and the untracked-file fold gains a bounded, explicit inclusion rule (only untracked files within the unit's path scope), excluding unrelated parked-feature scaffolds.

**Rationale**: Verified that the implement payload folds the feature's own audit-log excerpt (self-referential generator) and untracked files wholesale (parked scaffolds → #431 family). Removing the generator is a precondition for D1/D2 converging on real signal (SC-005). The audit-log is still used by the *dampener/gate* (reading findings) — it is only removed from the *audited payload* (what the models read).

## D8 — Sonnet re-calibrated to an override profile under mechanical read-only (thread 5; FR-011)

**Decision**: sonnet is re-spawned on a representative per-phase payload under `--permission-mode plan` (014 enforcement). The re-admission bar: (1) latency within its derived timeout (with 014 margin) at the per-phase payload size; (2) finding depth (verified, live-probe findings — not haiku-style zero-depth); (3) on-task (zero mutations — mechanically guaranteed — and no runaway tool-loop). Meeting the bar admits it to an **operator-selectable override profile** lane in the template (mirroring the fable thoroughness override), with the admit/reject decision + evidence recorded. Default-fleet promotion is a separate later decision.

**Rationale**: Verified sonnet's two disqualifiers — read-only violation (now mechanically impossible under plan-mode, 014 SC-002) and 2226 s/off-task on a 69 KB payload — are both coupled to payload size + enforcement, the exact levers D6 + 014 move. The smaller per-phase payload scales the derived timeout down (`secs_per_kb × kb`); plan-mode blocks the off-task tool-calling that wasted sonnet's run. The override-profile-first path keeps the default fleet stable while restoring model diversity cheaply.

**Alternatives considered**: admit straight to default fleet (rejected in clarify — prove the profile first); leave sonnet excluded (rejected — the disqualifiers are now addressable, and diversity is the reason to barrage). haiku remains excluded (zero depth is not size-driven).

**Outcome (live calibration, 2026-06-12)**: the hypothesis held. On a 12.4 KB per-phase payload sonnet met all three bars — latency **224 s** (< 300 s derived timeout; ~10× under the 2226 s big-unit figure, confirming the payload-size coupling this decision rests on), 4 file:line-anchored depth-findings (one corroborating an opus finding), 4 tool calls + zero repo mutations under plan-mode. **Admitted to the override profile** (config lane re-annotated PASSED, kept commented/opt-in); default-fleet promotion remains the operator's later call on a broader payload-size sample. Evidence: quickstart-results.md § US5.
