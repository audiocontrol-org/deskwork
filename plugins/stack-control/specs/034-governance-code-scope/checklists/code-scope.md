# Requirements Quality Checklist: Governance Code Scope

**Purpose**: Unit-test the *requirements* (spec.md) for completeness, clarity, consistency, measurability, and coverage before implementation. Not an implementation/test-execution checklist.
**Created**: 2026-07-04
**Feature**: [spec.md](../spec.md)

## Filter Semantics (Requirement Correctness)

- [ ] CHK001 - Is the drop condition stated unambiguously as a boolean predicate (exclude ∧ ¬include) rather than prose that could read two ways? [Clarity, Spec §FR-004]
- [ ] CHK002 - Is "include wins over exclude" specified for the exact case where a file matches BOTH lists? [Completeness, Spec §FR-004, §US2-3]
- [ ] CHK003 - Is the identity/no-op behavior when `code_only` is false specified to reproduce today's payload *exactly* (not merely "similar")? [Measurability, Spec §FR-007, §SC-004]
- [ ] CHK004 - Is per-file-diff preservation for surviving files stated as a requirement (dropping a file must not alter others' diffs)? [Completeness, Spec §FR-003]
- [ ] CHK005 - Is root-vs-nested glob matching an explicit requirement, with a concrete example distinguishing root `README.md` (dropped) from root `CLAUDE.md` (kept)? [Coverage, Spec §FR-009, §US2-5]
- [ ] CHK006 - Is the filter required to be a deterministic, order-independent pure transform (so it belongs on the test floor, not the stochastic layer)? [Clarity, Spec §FR-013]

## Config Resolution (Requirement Completeness & Consistency)

- [ ] CHK007 - Are the default `exclude` and `include` glob lists enumerated literally in the requirements (not described as "sensible defaults")? [Completeness, Spec §FR-006]
- [ ] CHK008 - Is "absent block ⇒ defaults" distinguished from "present-but-malformed ⇒ throw" so the two are not conflated? [Consistency, Spec §FR-006, research §Decision 5]
- [ ] CHK009 - Is replace-not-merge specified for operator-supplied lists, including what happens to the *other* (unspecified) list? [Clarity, Spec §FR-008]
- [ ] CHK010 - Is the wire (snake_case YAML) ↔ in-memory (camelCase) mapping documented for every field? [Completeness, Spec §Key Entities]
- [ ] CHK011 - Is the throw-on-malformed requirement aligned with Principle V (no silent fallback masking operator error)? [Consistency, research §Decision 5]

## Empty-Scope Success Path (Coverage & Measurability)

- [ ] CHK012 - Is the empty-code-scope success distinguished from a genuinely-empty diff, so the existing empty-scope guard is not blanket-removed? [Coverage, research §Decision 3]
- [ ] CHK013 - Is it specified that the "nothing to govern" success satisfies the graduation precondition (not just that it avoids the fatal)? [Completeness, Spec §FR-011, §US3-2]
- [ ] CHK014 - Is the graduation implication (a docs-only change can ship without a barrage run) stated explicitly as accepted? [Clarity, Spec §US3]

## Lens (Consistency)

- [ ] CHK015 - Is the doc-drift omission scoped to *only* when `code_only` is active, with the original bullet retained when off? [Consistency, Spec §FR-010, §Contract 4]
- [ ] CHK016 - Is the requirement that a code-only run's prompt contain NO documentation instruction stated measurably (inspectable)? [Measurability, Spec §SC-006]

## Observability (Clarity & Boundaries)

- [ ] CHK017 - Is the exclusion summary required to carry a COUNT and explicitly NOT the full path list? [Clarity, Spec §FR-014, §SC-007]
- [ ] CHK018 - Is it specified when the summary is NOT emitted (no files excluded)? [Completeness, Spec §FR-014]
- [ ] CHK019 - Is the empty-scope reason required to appear on the success path output? [Coverage, Spec §FR-014]

## Scope Boundaries (Consistency & Coverage)

- [ ] CHK020 - Is "implement-mode only" stated as a hard boundary, with spec-mode explicitly required to be unchanged? [Consistency, Spec §FR-012]
- [ ] CHK021 - Is the mid-fix re-scope explicitly in scope for the filter (so docs introduced by a fix don't leak into a later round)? [Coverage, Spec §US1-4]
- [ ] CHK022 - Is the clone sub-step's existing code-only behavior noted as out of scope (no change required)? [Completeness, Spec §Edge Cases]
- [ ] CHK023 - Is the governing classification rule (code = defines runtime; docs = meta-info) stated once, canonically, and used to justify every default? [Consistency, Spec §Governing Classification Rule]

## Assumptions & Open Questions (Traceability)

- [ ] CHK024 - Are the carried-forward open questions (list merge, glob engine, fixtures, rule breadth) recorded as assumptions rather than silently resolved? [Assumption, Spec §Assumptions, research §Carried-forward]
- [ ] CHK025 - Is the `govern-doc-aware-audit-lens` supersession flagged as an operator-owned roadmap disposition and explicitly OUT of this feature's implementation scope? [Traceability, Spec §Assumptions]

## Notes

- Items are requirement-quality gates, not test cases. A checked item means the *requirement is well-written*, not that the code works.
- Traceability: 24/25 items carry a `[Spec §…]` or research reference; CHK024/025 use `[Assumption]`/`[Traceability]` markers per the checklist convention.
