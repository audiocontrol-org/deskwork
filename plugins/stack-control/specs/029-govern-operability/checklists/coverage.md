# Requirements Quality Checklist: govern-operability (coverage / completeness / consistency)

**Purpose**: Unit-tests-for-English over specs/029-govern-operability — validate that the requirements across the nine user stories (and the two operator-named frictions) are complete, clear, consistent, and measurable before `/speckit-tasks`.
**Created**: 2026-06-19
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [ ] CHK001 - Does each of the nine user stories (US1–US9) have at least one functional requirement AND at least one acceptance scenario? [Completeness, Spec §User Scenarios / §Requirements]
- [ ] CHK002 - Are requirements present for every referenced backlog task (TASK-60/145/146/149/154/263/288/289/290/291/292/293/294/316/317/318)? [Coverage, Spec §SC-009]
- [ ] CHK003 - Is the "never lift an already-fixed finding" friction (a) captured as an explicit, standalone requirement distinct from dedup? [Completeness, Spec §FR-013]
- [ ] CHK004 - Is the "override is terminal / short-circuits the barrage" friction (b) captured with the explicit "zero barrage runs" guarantee? [Completeness, Spec §FR-017]
- [ ] CHK005 - Are requirements defined for what counts as a "quiet run" vs a "degraded run" so the dampener's counting input is fully specified? [Completeness, Spec §FR-006/007/008]
- [ ] CHK006 - Is the new `backlog done`/close verb specified with its trigger (finding flips fixed) AND its manual invocation? [Completeness, Spec §FR-015]
- [ ] CHK007 - Are requirements present for the shipped-template config change AND the lockstep installation-config update (not just one)? [Completeness, Spec §FR-001/004]

## Requirement Clarity

- [ ] CHK008 - Is the finding-signature defined precisely enough to be implementable and testable (its exact components + normalization)? [Clarity, Spec §FR-019 / Clarifications]
- [ ] CHK009 - Is the hunk-fingerprint unit unambiguous (what "the phase's own diff hunks" means, and that per-symbol is excluded)? [Clarity, Spec §FR-026 / Clarifications]
- [ ] CHK010 - Is "short-circuit only, no persistence" stated unambiguously for the override (no fingerprint-keyed marker)? [Clarity, Spec §FR-018 / Clarifications]
- [ ] CHK011 - Is "out-of-window = not-in-scope-this-phase" defined clearly enough that an auditor instruction can be derived from it? [Clarity, Spec §FR-021]
- [ ] CHK012 - Is the either-of graduate gate stated with which path is default and which is opt-in (no ambiguity about behavior with no opt-in)? [Clarity, Spec §FR-023/024]
- [ ] CHK013 - Is the read-only-by-construction requirement for the Anthropic lanes specific about the mechanism intent (no tools available) rather than vague "read-only"? [Clarity, Spec §FR-001]

## Requirement Consistency

- [ ] CHK014 - Is the finding-signature definition used consistently by BOTH the dampener identity-key (FR-009) and the lift dedup (FR-016)? [Consistency, Spec §FR-019]
- [ ] CHK015 - Do the override requirements (FR-017 short-circuit, FR-018 attributable) agree with the data-model override-marker (per-invocation, no persistence)? [Consistency, data-model.md]
- [ ] CHK016 - Is "degraded ≠ quiet" stated consistently across US1, US2, and US3 (no story implying a degraded run can converge)? [Consistency, Spec §FR-007 / §US3]
- [ ] CHK017 - Does the granularity decision (default per-phase) stay consistent with the claim that US5/US7 are critical-path? [Consistency, Spec §US6 / Assumptions]
- [ ] CHK018 - Is the "do not re-implement specs/015/021" boundary stated consistently and not contradicted by any FR that would re-do shipped work? [Consistency, Spec §Context]
- [ ] CHK019 - Does the fleet-composition "do not change" constraint (FR-005) stay consistent with the opus-calibration assumption (calibrate, escalate, don't drop)? [Consistency, Spec §FR-005 / Assumptions]

## Acceptance Criteria Quality (Measurability)

- [ ] CHK020 - Can SC-002 (override fires zero barrage runs) be objectively measured (a countable: new run directories = 0)? [Measurability, Spec §SC-002]
- [ ] CHK021 - Can SC-003 (already-fixed → zero tasks; ≤1 task per signature) be objectively counted? [Measurability, Spec §SC-003]
- [ ] CHK022 - Can SC-005 (shared-file N-phase governs O(n)) be verified via a concrete fixture (different-hunk vs same-hunk)? [Measurability, Spec §SC-005]
- [ ] CHK023 - Can SC-008 (no payload-scoping false HIGHs while real ones still raised) be verified with a positive AND a negative fixture? [Measurability, Spec §SC-008]
- [ ] CHK024 - Is each success criterion technology-agnostic (operator-observable governance outcome, not an internal metric)? [Measurability, Spec §Success Criteria]

## Scenario & Edge-Case Coverage

- [ ] CHK025 - Are requirements defined for override on already-clean code (it still graduates with no barrage)? [Edge Case, Spec §Edge Cases]
- [ ] CHK026 - Are requirements defined for a finding that re-surfaces after its backlog task was reconciled (reuse/close, not duplicate)? [Edge Case, Spec §Edge Cases]
- [ ] CHK027 - Are requirements defined for a within-phase file rename interacting with hunk fingerprinting (021 rename-aware scoping)? [Edge Case, Spec §Edge Cases]
- [ ] CHK028 - Are requirements defined for the either-of gate evaluating the whole-feature path without requiring per-phase hunk fingerprints (and vice-versa)? [Coverage, Spec §Edge Cases]
- [ ] CHK029 - Is the negative case covered for determinism (a genuinely-new HIGH still blocks) so real signal isn't suppressed? [Coverage, Spec §FR-011]
- [ ] CHK030 - Is the negative case covered for payload widening (a genuinely-missing impl still raises a real HIGH)? [Coverage, Spec §FR-022]

## Dependencies & Assumptions

- [ ] CHK031 - Is the dependency on the shipped specs/015 + 021 substrate documented (the surfaces extended, not rebuilt)? [Assumption, Spec §Assumptions / plan.md]
- [ ] CHK032 - Is the build-sequencing assumption (US1→US9 sharpen-the-saw; US5/US7 critical-path) recorded so task ordering can rely on it? [Assumption, Spec §Assumptions]
- [ ] CHK033 - Is the hysteresis-window default (FR-012) recorded as an assumption with a tunable note rather than left ambiguous? [Assumption, Spec §Assumptions]
- [ ] CHK034 - Is the adopter-routing system-of-record (GitHub issues) stated as an assumption for US9? [Assumption, Spec §Assumptions / §FR-034]

## Notes

- This checklist tests the REQUIREMENTS, not the implementation; items are resolved by editing the spec, not by writing code.
- Resolve any failing item before `/speckit-tasks`; carry genuinely-deferred items into `/speckit-analyze` consideration.
