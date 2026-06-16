# Enforcement-Correctness Requirements Checklist: Un-skippable workflow protocol

**Purpose**: Unit-tests-for-English — validate that the SPEC's enforcement requirements
are falsifiable, operator-perceivable, complete, clear, and consistent. Tests the
requirements' quality, NOT the implementation.
**Created**: 2026-06-16
**Feature**: [spec.md](../spec.md)

## Falsifiability & Operator-Perceivability (spec-compliance-probe discipline)

- [x] CHK001 - Is each of the five surfaces (US1–US5) stated as an assertion an operator could re-run and see fail, rather than a description of the intended mechanism? [Clarity, Spec §US1–US5]
- [x] CHK002 - Are the Success Criteria (SC-001..SC-007) each derived from a spec clause and phrased as an observable outcome, not an internal mechanism state? [Measurability, Spec §Success Criteria]
- [x] CHK003 - Does every functional requirement have at least one acceptance scenario OR success criterion that would fail if the requirement were violated? [Traceability, Spec §FR/§SC]
- [x] CHK004 - Are the contracts' "test obligations" expressed against spec clauses (not the chosen mechanism), so a passing test proves the requirement, not the imagined implementation? [Clarity, contracts/*]

## Per-phase graduate gate (US1) — requirement completeness & clarity

- [x] CHK005 - Are all four gate-failure modes (missing checkpoint, stale checkpoint, missing/incomplete file list, zero derivable phases) each named as distinct, testable requirements? [Completeness, Spec §FR-001..FR-004, §US1]
- [x] CHK006 - Is "current" (checkpoint freshness) defined with an objective criterion (fingerprint match against present content), not a vague adjective? [Clarity, Spec §FR-003]
- [x] CHK007 - Is the "compose" decision specified unambiguously — i.e. does the spec state the whole-feature signal is DERIVED from per-phase checkpoints AND that no separate whole-feature govern run occurs? [Clarity, Spec §FR-001a]
- [x] CHK008 - Does the spec specify that a standalone whole-feature record alone does NOT satisfy the gate? [Completeness, Spec §FR-001]
- [x] CHK009 - Is it specified that the gate applies to BOTH `governing→shipped` and `implementing→governing`, with the phase set each evaluates? [Consistency, Spec §FR-001/FR-002]
- [x] CHK010 - Is the gate's "no writes" property (reads intent, writes nothing back) stated? [Consistency, Spec §FR / Principle IV]

## Execute per-phase cadence + commit/push (US2/US3) — clarity & coverage

- [x] CHK011 - Is the per-phase boundary sequence (govern → commit → push) specified as ordered and non-discretionary, not as agent guidance? [Clarity, Spec §FR-006, contracts/execute-cadence.md]
- [x] CHK012 - Is the refuse-to-start-phase-N+1 requirement stated with its precondition (phase N checkpoint current)? [Completeness, Spec §FR-007]
- [x] CHK013 - Is commit-local-first vs push specified as a definite ordering (work-safe guarantee), not "commit and push"? [Clarity, Spec §FR-009/FR-010]
- [x] CHK014 - Are all push-failure modes (offline / auth / hook failure) covered by a single unambiguous fail-loud requirement, with the local commit explicitly preserved? [Coverage, Spec §FR-011, §SC-007]
- [x] CHK015 - Is `--no-verify` explicitly prohibited rather than left implicit? [Clarity, Spec §FR-011]

## Fail-loud paths — never silent downgrade

- [x] CHK016 - Does every degradation point (missing file list, oversized phase, push failure, zero phases) specify FAIL LOUD, with no requirement permitting a silent downgrade or partial/empty payload? [Consistency, Spec §FR-004/FR-008/FR-011, §US1]
- [x] CHK017 - Is the oversized-single-phase behavior specified as fail-loud pointing at right-sizing (TASK-75), explicitly NOT auto-split and NOT silently scoped down? [Clarity, Spec §FR-008, §SC-006]
- [x] CHK018 - Is "boundary-too-large becomes a non-event on the sanctioned path" stated as a measurable outcome (SC-006) rather than an aspiration? [Measurability, Spec §SC-006]

## Speckit wrapper (US4) — coverage & consistency

- [x] CHK019 - Is the full set of wrapped backend skills (specify/plan/tasks/implement) enumerated, with each one's redirect front door specified? [Completeness, Spec §FR-012, contracts/speckit-wrapper.md]
- [x] CHK020 - Is the redirect mapping internally consistent (authoring → define/extend; implement → execute)? [Consistency, Spec §FR-012]
- [x] CHK021 - Is the no-false-positive requirement (front-door invocation must NOT be refused) specified, not only the refusal? [Coverage, Spec §US4 scenario]
- [x] CHK022 - Is the enforcement-home requirement (skill body / CLI verb, travels with install, never git hook) stated for the wrapper? [Consistency, Spec §FR-013/FR-018]

## Honest boundary (FR-017) — stated as a non-claim, not a gap

- [x] CHK023 - Is the human-bypass limitation specified as a deliberate non-claim (the spec asserts it does NOT prevent a raw-git/gh/speckit bypass), rather than appearing as an unaddressed gap? [Clarity, Spec §FR-017]
- [x] CHK024 - Is the defense-in-depth relationship (evaded wrapper still cannot graduate, US1) specified to bound exactly what IS guaranteed? [Completeness, Spec §FR-014/FR-017]

## No agent-offered shortcuts (US5)

- [x] CHK025 - Is "no skip/defer/shortcut affordance" specified as an auditable invariant over skill bodies, with an enforceable check named? [Measurability, Spec §FR-015, §SC-005, contracts/speckit-wrapper.md]
- [x] CHK026 - Is the boundary between a (prohibited) agent-offered protocol bypass and a (permitted) operator-initiated scope decision specified clearly enough to classify a given branch? [Clarity, Spec §FR-016]

## Dependencies & assumptions — explicit preconditions

- [x] CHK027 - Is TASK-70 (authoritative phase file lists) stated as a hard PRECONDITION for the FR-004 soundness, not merely mentioned? [Dependency, Spec §FR-004, §Assumptions]
- [x] CHK028 - Is TASK-75 (phase right-sizing) stated as the companion the FR-008 fail-loud path defers to, with the division of responsibility clear? [Dependency, Spec §FR-008, §Assumptions]
- [x] CHK029 - Is the implementation-session vs orchestrator-session boundary for auto-commit/push stated as an assumption with its rationale (two-session rule)? [Assumption, Spec §Assumptions]
- [x] CHK030 - Is the enforcement-home invariant (WORKFLOW.md + skill bodies + CLI verbs; never .husky/.git/hooks) stated once as a cross-cutting requirement covering all five surfaces? [Consistency, Spec §FR-018, §Context]

## Notes

- This checklist validates the SPEC's requirement quality, not the implementation. Items
  are questions about whether the requirement is well-written; an unchecked item means the
  spec needs a wording/coverage fix before `/speckit-tasks`.
- Authored per the user's enforcement-correctness focus + the `ui-verification.md`
  spec-compliance-probe discipline (assertions derived from the spec clause, not the
  imagined mechanism).
- **Verification (2026-06-16, during `/stack-control:execute`)**: all 30 items verified
  against `spec.md`, `contracts/{graduate-gate,execute-cadence,speckit-wrapper}.md`,
  `research.md`, and `data-model.md`. Every item passes — consistent with `speckit-analyze`
  running clean (C1/U1/A1 + L1/L2 remediated). No spec wording/coverage fix required.
