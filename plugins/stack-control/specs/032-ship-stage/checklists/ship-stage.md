# Requirements Quality Checklist: ship-stage

**Purpose**: Validate the QUALITY of the ship-stage requirements (completeness, clarity, consistency, measurability, coverage) before `/speckit-tasks` — unit tests for the spec's English, not the implementation.
**Created**: 2026-06-23
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [ ] CHK001 - Are all steps the ship weld performs (open PR → confirm CI green → merge → fire graduate) enumerated, with the boundary of what ship does NOT do (release, close, auto-run) explicit? [Completeness, Spec §FR-001..004, US1]
- [ ] CHK002 - Is the ship precondition (govern-converged / `graduate-impl` green) stated as a requirement, including the refusal behavior when unmet? [Completeness, Spec §FR-001, US1 AC2]
- [ ] CHK003 - Are the workflow waypoints where the backstop refuses enumerated (the close step + the compass precondition every workflow skill calls)? [Completeness, Spec §FR-009]
- [ ] CHK004 - Is the merged-but-status-in-flight detection signal fully specified, including the base-undeterminable (detached HEAD / no remote) case? [Completeness, Spec §FR-012, Edge Cases]
- [ ] CHK005 - Are both new phases (`merging`, `validating`) and their exact position in the `governing→merging→shipped→validating→closed` chain specified? [Completeness, Spec §FR-005, FR-014]
- [ ] CHK006 - Is the `validating` default exit (operator-confirm `validated` marker) AND the adopter-override mechanism both documented? [Completeness, Spec §FR-014..016]
- [ ] CHK007 - Are the advisory-only requirements for session-start/session-end on the merged-but-status-in-flight condition present? [Completeness, Spec §FR-011, SC-004]

## Requirement Clarity & Measurability

- [ ] CHK008 - Is "non-discretionarily / no skip-defer-shortcut branch" expressed as a testable property (no path merges without recording) rather than narrative? [Clarity, Measurability, Spec §FR-002, FR-003]
- [ ] CHK009 - Is the coherence invariant stated measurably ("derived phase is a function of recorded status + the `validated` marker — the same source the close gate reads") rather than a vague "should agree"? [Measurability, Spec §FR-007, FR-008, SC-002]
- [ ] CHK010 - Is "shipped means merged" unambiguous given the monorepo merge≠release split (i.e., is shipped≠released stated explicitly)? [Clarity, Spec §FR-006, Assumptions]
- [ ] CHK011 - Is the backstop reconcile exemption stated precisely enough to test (exactly which transition is never blocked)? [Clarity, Spec §FR-010]
- [ ] CHK012 - Is the CI-green gate unambiguous (operator confirmation, not poll), including the not-confirmed outcome (no merge, no recording)? [Clarity, Spec §FR-019, Edge Cases]
- [ ] CHK013 - Is "independent of whether ship ran" tied to a concrete, verifiable signal so it can be objectively checked? [Measurability, Spec §FR-012]

## Requirement Consistency

- [ ] CHK014 - Is the backstop's "NOT in session-start/session-end" requirement consistent with the "surface as advisory" requirement (refuse at waypoints; surface-only at session skills)? [Consistency, Spec §FR-009, FR-011]
- [ ] CHK015 - Is "no gh-API for the on-rail weld" consistent with the backstop reading a git remote ref (git remote ≠ gh-API)? [Consistency, Spec §FR-012, FR-013]
- [ ] CHK016 - Does each success criterion (SC-001..SC-007) trace to a functional requirement without contradiction? [Consistency, Traceability]
- [ ] CHK017 - Is the "validating default == 031 pre-close confirm" claim consistent with the close gate gaining an `approval-marker validated` criterion? [Consistency, Spec §FR-014, plan §R6]

## Scenario & Edge Case Coverage

- [ ] CHK018 - Are requirements defined for MULTIPLE simultaneous merged-but-status-in-flight items (backstop surfaces all / does not deadlock once one reconciles)? [Coverage, Edge Case, Spec §Edge Cases]
- [ ] CHK019 - Is the "item shipped but never validated" (indefinite validating) case addressed as advisory, not force-close? [Edge Case, Spec §Edge Cases]
- [ ] CHK020 - Is the "adopter with no validation process" case covered (validated = bare confirm; never a hard blocker requiring absent machinery)? [Edge Case, Spec §Edge Cases, FR-015]
- [ ] CHK021 - Is the off-rail raw-merge residual explicitly in scope as the backstop's reason to exist (honest boundary), with prevention explicitly NOT claimed? [Coverage, Spec §FR-017]
- [ ] CHK022 - Are requirements defined for red/never-green CI (ship merges nothing, records nothing)? [Edge Case, Spec §FR-019, Edge Cases]

## Clean-Break & One-Unit Delivery

- [ ] CHK023 - Is the clean-break requirement explicit — `shipped`'s old `record-converged` derive is REPLACED with no back-compat arm, and 031 fixtures/tests asserting the old derive are updated in the same delivery? [Completeness, Consistency, Spec §FR-018, contracts/workflow-grammar-changes]
- [ ] CHK024 - Is the one-unit requirement (no partial increment leaving the shipped↔closed surfaces inconsistent) measurable via SC-007? [Measurability, Spec §FR-018, SC-007]

## Dependencies & Assumptions

- [ ] CHK025 - Are the prior-feature dependencies (025 shipped, 024, 022, 031) and the `depends-on`/`part-of` edges documented as assumptions? [Assumption, Spec §Assumptions]
- [ ] CHK026 - Is the assumption that the govern convergence record exists AND is committed (so it can be reachable from `origin/main`) validated as a precondition of the merge-detection signal? [Assumption, Spec §FR-012]

## Ambiguities & Open Points

- [ ] CHK027 - Is the `shipped`-vs-`validating` derive discriminator (the `validated` marker) unambiguous given both map to `status: shipped`? [Ambiguity, Spec §FR-007, plan §R3]
- [ ] CHK028 - Is the exact reconcile command the backstop directs to specified, or explicitly deferred to plan/implementation? [Ambiguity, Spec §FR-010, contracts/backstop-compass-invariant]
