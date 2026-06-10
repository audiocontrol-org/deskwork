# Checklist: Correctness & Safety Requirements Quality

**Purpose**: Unit-test the *requirements* (not the implementation) for the load-bearing correctness/safety contract of insight-capture — atomicity, fail-loud refusals, the capture≠scope and record-not-create boundaries, and the single-source-of-truth outcome. Validates that these are complete, clear, consistent, and measurable before tasks/implementation.
**Created**: 2026-06-08
**Feature**: [spec.md](../spec.md) · [contracts/inbox-cli.md](../contracts/inbox-cli.md)
**Defaults used**: Standard depth · reviewer audience · focus = correctness/safety + scope boundary (no interactive scoping questions per operator momentum).

## Requirement Completeness

- [X] CHK001 - Are the *required inputs* for capture specified unambiguously (what is mandatory vs optional)? [Completeness, Spec §FR-002, data-model "Capture"]
- [X] CHK002 - Are refusal conditions enumerated for every mutation (capture/promote/drop), not just the happy path? [Completeness, Spec §FR-010, Edge Cases]
- [X] CHK003 - Is the behavior when the inbox file is missing or not governable defined for *all* operations (capture, promote, drop, list)? [Completeness, Spec §FR-010]
- [X] CHK004 - Are lean-keeping requirements (clearing terminal entries while preserving history) specified, including the restore path? [Completeness, Spec §FR-008, SC-005]
- [X] CHK005 - Does the spec define what "retire the interim convention" concretely requires (which artifacts removed, what must remain)? [Completeness, Spec §FR-011, US3]

## Requirement Clarity

- [X] CHK006 - Is "in a single action / one move" defined precisely enough to be testable (what counts as one move)? [Clarity, Spec §FR-001, SC-001]
- [X] CHK007 - Is "add-time re-validation" specified as validating the *whole* document before any write (not just the new entry)? [Clarity, Spec §FR-003]
- [X] CHK008 - Is "zero-write / inbox unchanged on failure" stated as a byte-for-byte guarantee rather than a vague "doesn't corrupt"? [Clarity, Spec §FR-003, SC-002]
- [X] CHK009 - Is the capture≠scope boundary clear about what capture MUST NOT require (no scope/sequence/triage decision)? [Clarity, Spec §FR-005]
- [X] CHK010 - For promote, is "record linkage, do not create the target" stated unambiguously (promote records a reference; creation is a separate step)? [Clarity, Spec §FR-014, Clarifications 2026-06-08]
- [X] CHK011 - Are the three statuses and which are terminal defined without ambiguity? [Clarity, data-model "Status lifecycle"]

## Requirement Consistency

- [X] CHK012 - Do the spec (FR-007/FR-014), the data-model, and the CLI contract agree on promote/drop inputs and recorded outputs? [Consistency, Spec §FR-007/§FR-014, contracts/inbox-cli.md]
- [X] CHK013 - Is the dry-run-by-default + `--apply`-to-write convention stated consistently across all subactions? [Consistency, contracts/inbox-cli.md]
- [X] CHK014 - Is the single-source-of-truth outcome (FR-011) consistent with the retirement steps in the plan (no second capture path left)? [Consistency, Spec §FR-011, plan.md US3]

## Acceptance Criteria Quality (Measurability)

- [X] CHK015 - Is SC-002 ("100% of invalid captures refused, inbox unchanged") objectively verifiable (a clear pass/fail)? [Measurability, Spec §SC-002]
- [X] CHK016 - Is SC-004 ("exactly one capture mechanism / one source of truth") expressed so it can be checked, not just asserted? [Measurability, Spec §SC-004]
- [X] CHK017 - Can each user story's Independent Test be executed as written to demonstrate the story in isolation? [Acceptance Criteria, Spec §US1–US3]

## Scenario & Edge-Case Coverage

- [X] CHK018 - Are duplicate-identifier and empty/whitespace-idea captures covered as explicit refusal requirements? [Edge Case, Spec Edge Cases]
- [X] CHK019 - Are promote/drop against an absent or already-terminal entry covered as explicit refusals? [Edge Case, Spec Edge Cases]
- [X] CHK020 - Are concurrent/racing captures addressed (a stated consistency guarantee), or explicitly scoped out with rationale? [Coverage, Spec Edge Cases, research D7]
- [X] CHK021 - Is the missing/ungovernable-inbox failure path covered for triage operations, not only capture? [Coverage, Spec §FR-010]

## Dependencies, Assumptions & Boundaries

- [X] CHK022 - Is the dependency on the shipped front door and the existing document-primitives engine/grammar documented (built through, reuse not reinvent)? [Dependency, Spec Assumptions, plan.md]
- [X] CHK023 - Are out-of-scope boundaries explicit and justified (frontend surface → control-plane-frontend; Ideas-stage integration → none in v1)? [Assumption/Boundary, Spec Assumptions, Clarifications 2026-06-08]

## Ambiguities & Conflicts

- [X] CHK024 - Is the promote target reference's *form* defined enough to record (spec dir / roadmap id / issue ref) without implying validation of its existence? [Ambiguity, Spec §FR-014, data-model]
- [X] CHK025 - Does any requirement implicitly assume capture also creates the graduation target (which would conflict with FR-014's record-not-create)? [Conflict, Spec §FR-007/§FR-014]

## Notes

- This checklist tests requirement *quality*, not behavior. Items are resolved by confirming the spec/contract/data-model already answer them, or by tightening the spec where a `[Gap]`/`[Ambiguity]` is found, before `/speckit-tasks`.
- **Resolved 2026-06-08 at `/speckit-implement` pre-flight**: all 25 items confirmed answered by the existing artifacts — each traces to a concrete spec clause (e.g. CHK007→FR-003 + research D1 "re-validate the whole governed document"; CHK010→FR-014 record-not-create; CHK020→Edge Cases + research D7, concurrency explicitly scoped out with last-writer-wins rationale). Consistent with the `/speckit-analyze` result (0 critical / 0 high, 100% coverage). No spec gaps surfaced.
