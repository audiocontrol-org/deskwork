# Requirements Checklist: Clean-break completeness & cross-file-correctness/fail-loud safety

**Purpose**: Validate that the *requirements* for the chunked-end-govern feature are complete, unambiguous, consistent, and measurable in its two highest-risk areas — the clean break (no deprecation residue) and cross-file correctness with fail-loud safety. Unit tests for the English, not for the code.
**Created**: 2026-06-21
**Feature**: [spec.md](../spec.md)
**Focus**: clean-break completeness; cross-file correctness; fail-loud failure surfacing; requirement testability; explicit open questions

## Clean-break completeness (no deprecation/grandfather residue)

- [ ] CHK001 - Is the full set of per-phase surfaces to delete enumerated explicitly (flag, env var, checkpoint writer, artifact, doctor/schema rule, gate arm, compass/workflow arms, named functions)? [Completeness, Spec §FR-017..FR-020]
- [ ] CHK002 - Is "removed" defined observably for each deleted surface (e.g. invoking `--phase`/`GOVERN_CHECKPOINT` errors as unknown), rather than left as "no longer used"? [Clarity, Spec §FR-017, US2]
- [ ] CHK003 - Does the spec state that NO deprecation alias, legacy-accept path, or grandfather remains for any deleted surface? [Completeness, Spec §FR-020]
- [ ] CHK004 - Is the graduate gate's collapse to a single criterion (whole-feature record only) stated unambiguously, including removal of the either-of arm and `allPhaseCheckpointsCurrent` + callers? [Clarity, Spec §FR-018]
- [ ] CHK005 - Is the in-flight per-phase migration decision recorded as an explicit WONTFIX (not silently omitted)? [Completeness, Spec §FR-020, US2]
- [ ] CHK006 - Are the requirements consistent that the composition path is REPLACED (inclusion-based) rather than fixed-in-place? [Consistency, Spec §FR-023, US8]
- [ ] CHK007 - Is it specified that deleting the `boundary-too-large` FATAL must NOT delete the envelope-measurement primitive the bin-packer needs? [Conflict-avoidance, research.md Tensions]
- [ ] CHK008 - Is the `phaseId`-keyed boundary-check interface's rekey-to-chunk/seam-id called out so the deletion leaves no dangling typed reference? [Gap, research.md Tensions]

## Cross-file correctness coverage

- [ ] CHK009 - Are the coupling signals that group files into a cluster defined (directory-adjacency, diff cross-references, optional TS import graph)? [Completeness, Spec §FR-003]
- [ ] CHK010 - Is the chunk manifest's required content specified (which other chunks' file lists each chunk carries)? [Clarity, Spec §FR-005]
- [ ] CHK011 - Is the seam pass's input scope defined (which boundaries: cross-chunk AND split-cluster)? [Completeness, Spec §FR-014]
- [ ] CHK012 - Is "substantive contract break" defined with discriminating criteria (removed/renamed export, changed arity, changed required shape consumed across a boundary) vs what must NOT be flagged? [Clarity, Spec §FR-014, Clarifications]
- [ ] CHK013 - Is the determinism requirement stated as a verifiable property (same `governedSha`..HEAD → identical chunk set + ids)? [Measurability, Spec §FR-004]
- [ ] CHK014 - Are requirements present that a fix's NEW file is assigned to a chunk for re-audit (the split-exclusion class must not recur)? [Coverage, Spec §FR-007]
- [ ] CHK015 - Is the touched-set's coupling-correctness specified (a fix to a file coupled into another chunk includes that chunk)? [Completeness, Spec §FR-012]
- [ ] CHK016 - Is bounded-loop termination expressed as a checkable guarantee, not an aspiration ("MUST terminate")? [Measurability, Spec §FR-013]

## Fail-loud failure surfacing (no silent degradation)

- [ ] CHK017 - Is the oversized-cluster path specified end-to-end (trim pre-pass → sub-split → `split-cluster` marker → never FATAL), including the recorded coverage caveat? [Completeness, Spec §FR-006]
- [ ] CHK018 - Is the unresolvable-merge behavior specified as surface-to-operator with no fabricated resolution? [Clarity, Spec §FR-010]
- [ ] CHK019 - Is the fix-subagent-failure behavior specified (isolate chunk, continue others, surface at reconcile)? [Completeness, Spec §FR-011]
- [ ] CHK020 - Is the round-cap-hit behavior specified as STOP + surface for override, explicitly NOT auto-graduating unresolved churn? [Clarity, Spec §FR-013, Clarifications]
- [ ] CHK021 - Are these four failure modes consistent in surfacing semantics (all loud, none silently degrade)? [Consistency, Spec §FR-006/010/011/013]
- [ ] CHK022 - Is the lane-outage behavior specified (degraded round, no fabricated clean result)? [Coverage, Spec Edge Cases]
- [ ] CHK023 - Is the "never FATAL on size for any feature" outcome stated as a measurable success criterion? [Measurability, Spec §SC-001]

## Reconcile-once & lift balloon

- [ ] CHK024 - Is "reconcile exactly once" specified, including the single-record-per-feature constraint? [Clarity, Spec §FR-015]
- [ ] CHK025 - Is close-in-loop-fixed-before-lift defined with a discriminating rule (fixed-and-absent-from-final-round → closed; still-open → lifted)? [Completeness, Spec §FR-016, US6]
- [ ] CHK026 - Is the zero-in-loop-fix-lifted outcome a measurable criterion? [Measurability, Spec §SC-005]

## Artifacts, sizing, testability

- [ ] CHK027 - Is each new artifact named and required to have a doctor/schema surface (chunk set, split-cluster markers, touched-set rounds, seam result, convergence record)? [Completeness, Spec §FR-021]
- [ ] CHK028 - Is the installation-anchor location for the new artifacts specified? [Clarity, Spec §FR-021, plan Technical Context]
- [ ] CHK029 - Is the ≤500-line cap stated as a verifiable criterion across ALL touched files (incl. the decomposed payload module)? [Measurability, Spec §FR-022/SC-007]
- [ ] CHK030 - Does each functional requirement have at least one acceptance scenario or success criterion making it testable? [Traceability, Spec §FR-001..FR-023]

## Explicit open questions (no silent cuts)

- [ ] CHK031 - Is OQ-1 (non-TS coupling precision / resolver-seam timing) marked as an explicit open question with a recommended default, not silently cut? [Assumption, Spec §Open Questions]
- [ ] CHK032 - Is OQ-2 (concurrency-cap default + configurability) marked as an explicit open question with a recommended default, not silently cut? [Assumption, Spec §Open Questions]
- [ ] CHK033 - Are the resolved open questions (OQ-3 seam rubric, OQ-4 anchor determinism) traceable to the clarifications that closed them? [Traceability, Spec §Clarifications]
