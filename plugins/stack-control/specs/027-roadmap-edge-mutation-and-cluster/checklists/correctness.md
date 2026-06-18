# Checklist: Correctness & Quality — roadmap edge-mutation and cluster

**Purpose**: Validate that the spec/contracts requirements are complete, clear, consistent, and measurable before implementation (unit-tests-for-requirements).
**Created**: 2026-06-18
**Feature**: [spec.md](../spec.md) · [contracts/roadmap-cli.md](../contracts/roadmap-cli.md)

## Cluster mutation correctness — Completeness

- [ ] CHK001 - Are requirements defined for both parent states (create when absent / reuse when present) without duplication? [Completeness, Spec §FR-008]
- [ ] CHK002 - Is the behavior specified when a `--children` id does not exist? [Completeness, Spec §FR-015]
- [ ] CHK003 - Are requirements defined for empty/omitted `--children`? [Completeness, Spec §FR-015]
- [ ] CHK004 - Is the `parent-id` == child-id case specified? [Completeness, Spec §FR-015]
- [ ] CHK005 - Is the `--summary`-omitted (bare parent) case specified? [Completeness, Spec §FR-008]
- [ ] CHK006 - Are requirements defined for a `--chain` ordering that would create a cycle? [Completeness, Edge, Spec §FR-012]

## Cluster mutation correctness — Clarity & Measurability

- [ ] CHK007 - Is "create-or-reuse" unambiguous that the parent is never duplicated? [Clarity, Spec §FR-008]
- [ ] CHK008 - Is `--chain` ordering (`a→b→c` by argument order) stated explicitly? [Clarity, Spec §FR-010]
- [ ] CHK009 - Is "conflicting `depends-on`" defined precisely for the `--chain` refusal? [Clarity, Spec §FR-014]
- [ ] CHK010 - Is "exact-duplicate edge" defined for the multi-parent no-op vs error distinction? [Clarity, Spec §FR-009]
- [ ] CHK011 - Is "zero-write-on-failure" quantified as byte-for-byte-unchanged and objectively verifiable? [Measurability, Spec §FR-013]
- [ ] CHK012 - Is the dry-run-default vs `--apply` boundary unambiguous? [Clarity, Spec §FR-011]

## Self-documenting CLI non-drift — Completeness & Measurability

- [ ] CHK013 - Does the spec/contract define the COMPLETE subaction set the no-subaction usage line must enumerate? [Completeness, Spec §FR-003]
- [ ] CHK014 - Are the value vocabularies (e.g. the status set) per-subaction help must surface specified? [Completeness, Spec §FR-004]
- [ ] CHK015 - Is the non-drift invariant (help flags == accepted flags) stated as a mechanically-checkable property? [Measurability, Spec §FR-005, contract]
- [ ] CHK016 - Can "zero probing required" be objectively verified as written? [Measurability, Spec §SC-001]

## Consistency

- [ ] CHK017 - Do dry-run/`--apply` and revalidation requirements align between `cluster` and the existing mutation verbs? [Consistency, Spec §FR-011/FR-012]
- [ ] CHK018 - Are exit-code semantics (0 / 2 / 1) consistent between the cluster contract and the self-doc-help contract? [Consistency, contract]
- [ ] CHK019 - Does the multi-parent allowance (FR-009) align with the data-model's `partOf` cardinality note? [Consistency, data-model]

## Scenario & non-regression coverage

- [ ] CHK020 - Are requirements defined for a child already `part-of` a different parent? [Coverage, Spec §FR-009]
- [ ] CHK021 - Are requirements defined for help on an un-migrated / machine-adapter verb? [Coverage, Edge Cases]
- [ ] CHK022 - Are non-regression requirements for un-migrated verbs specified and bounded? [Coverage, Spec §FR-006]
- [ ] CHK023 - Is the honest-header content fully specified (verbs named + worked example + fallback)? [Completeness, Spec §FR-016]

## Constitution / Non-Functional & Assumptions

- [ ] CHK024 - Is the no-`as`/no-`any` constraint at the parser-options boundary captured as a requirement/assumption with a validation gate? [NFR/Assumption, plan §Constitution VI, research Decision 1]
- [ ] CHK025 - Is the `mutations.ts` file-size cap flagged with a mitigation (split if >500 lines)? [NFR, plan §Complexity]
- [ ] CHK026 - Are fail-loud / no-fallback requirements specified for every cluster error path? [NFR, Spec §FR-015, Principle V]
- [ ] CHK027 - Is the atomicity-reuse assumption (`mutations.ts` build→revalidate→write) validated against the actual code, not assumed? [Assumption, research Decision 2]
- [ ] CHK028 - Is the `partOf` cardinality widening (`string`→`string[]`) flagged as a to-confirm item rather than silently assumed? [Assumption, data-model]
- [ ] CHK029 - Is the parser-library choice recorded as a decision with alternatives AND an explicit validation gate (no-cast boundary)? [Ambiguity/Assumption, research Decision 1]
- [ ] CHK030 - Is the store-seam-hardening requirement (FR-006a) expressed as boundary discipline, not a speculative second-store abstraction? [Consistency, Spec §FR-006a, Principle II]

## Notes

- 30 items, ≥80% carry a spec/contract/plan traceability reference.
- Two items (CHK027, CHK029) gate assumptions that, if wrong, change implementation: the `mutations.ts` reuse and the parser-library no-cast boundary. Resolve these first in implementation.
