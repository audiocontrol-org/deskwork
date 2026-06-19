# Coverage & Completeness Checklist: Front-Door Completeness

**Purpose**: Requirements-quality validation ("unit tests for the spec") — confirm the spec drops NO front-door gap and every requirement is testable, given the operator's no-scope-cuts mandate.
**Created**: 2026-06-19
**Feature**: [spec.md](../spec.md)

## Workstream Completeness (each of the four has FR + acceptance + measurable SC)

- [ ] CHK001 - Are US1 (discoverability) requirements backed by functional requirements AND a measurable success criterion? [Completeness, Spec §FR-001..007 / §SC-001]
- [ ] CHK002 - Are US2 (operation set) requirements backed by functional requirements AND a measurable success criterion? [Completeness, Spec §FR-010..018 / §SC-002/003]
- [ ] CHK003 - Are US3 (teeth recovery) requirements backed by functional requirements AND measurable success criteria? [Completeness, Spec §FR-020..026 / §SC-004/005]
- [ ] CHK004 - Are US4 (guardrail) requirements backed by functional requirements AND measurable success criteria? [Completeness, Spec §FR-030..035 / §SC-006/007]
- [ ] CHK005 - Does every User Story have at least one INDEPENDENTLY testable acceptance scenario? [Coverage, Spec §User Scenarios]
- [ ] CHK006 - Is the "no tiers / no deferral" mandate stated unambiguously so a future reader cannot treat a priority as optionality? [Clarity, Spec §Scope note]

## Backlog-gap Traceability (every claimed-closed TASK maps to an FR)

- [ ] CHK007 - Are the US1 backlog gaps (TASK-26 help; 291/204/217/205/213 SKILL.md; 130/147 discovery output; 69/294/211 docs) each traceable to an FR? [Traceability, Spec §FR-001..007]
- [ ] CHK008 - Are the US2 backlog gaps (TASK-297 close; 23 unpromote; 38/299 capture; 137/242 edge mutation; 133 unorphan; 298 approve-design; 21 edge-aware archival) each traceable to an FR? [Traceability, Spec §FR-010..018]
- [ ] CHK009 - Are the US3 backlog gaps (TASK-201 no-install; 209 recovery; 221 marker example; 215/218/203/164 linchpins; 165/194 speckit-guard; 197/193/191 fail-open/staleness/cold-start) each traceable to an FR? [Traceability, Spec §FR-020..026]
- [ ] CHK010 - Are the US4 backlog gaps (TASK-195/207/210/219/222 interceptor-loaded proof) traceable to an FR? [Traceability, Spec §FR-035]
- [ ] CHK011 - Is any claimed-closed TASK id present with NO corresponding FR (a silent drop)? [Gap, Coverage]
- [ ] CHK012 - Does the spec state which adjacent items are explicitly OUT of scope (one-move promote / post-release resolution owned by lifecycle-industrialization) so the boundary is auditable, not silent? [Clarity, Spec §FR-019]

## Single-Source-of-Truth Invariant (consistency)

- [ ] CHK013 - Is the command-tree-as-single-source invariant stated once and referenced consistently (help, verb reference, descriptor artifact, registry, check-front-door all derive)? [Consistency, Spec §FR-003/030/041/052]
- [ ] CHK014 - Does any requirement contradict the derive-don't-author rule (e.g., a hand-authored registry or manifest as a second source)? [Conflict, Spec §FR-030/041]
- [ ] CHK015 - Is "generated descriptor artifact" consistently described as a downstream OUTPUT of the command tree, never an authored input? [Consistency, Spec §FR-041/052]
- [ ] CHK016 - Is the relationship between the EXISTING 027 command-adapter and the NEW generalized surface stated so "generalize, not rebuild" is unambiguous? [Clarity, Spec §Why / Plan §Summary]

## Guardrail Obligations (measurability)

- [ ] CHK017 - Are check-front-door's four assertions each individually stated (skill exists; verb+subactions emit working --help exit 0; mutating ops mediation-registered; skill↔verb parity both directions)? [Completeness, Spec §FR-031]
- [ ] CHK018 - Are the three RED-test regression cases (deleted skill / broken --help / unfronted verb) each an explicit obligation, not a general "test it"? [Measurability, Spec §FR-033]
- [ ] CHK019 - Are the guardrail's firing surfaces (session-start advisory + implement/review gate; never a git hook; not CI) specified unambiguously? [Clarity, Spec §FR-034]
- [ ] CHK020 - Is "skill↔verb parity in both directions" defined so each direction (every verb has a skill; every skill's documented verbs exist) is independently checkable? [Clarity, Spec §FR-031d]

## Mediation Boundary (clarity / no ambiguity)

- [ ] CHK021 - Is the read-only mediation exemption (FR-050) unambiguous about WHICH operations are exempt and how the exemption is declared (mediation class on the descriptor)? [Clarity, Spec §FR-050]
- [ ] CHK022 - Is installation-scoped mediation (FR-020) stated so "no enclosing installation → never refuse the adopter's own backend" is unambiguous, and so a refusal always implies setup is satisfiable? [Clarity, Spec §FR-020]
- [ ] CHK023 - Is the recovery guarantee (a session is NEVER unrecoverable through a sanctioned verb) stated as an invariant, not a best-effort? [Clarity, Spec §FR-021]
- [ ] CHK024 - Are the 026 invariants this feature must preserve (session-keyed nesting-safe markers, lock-serialized writes, the graduate gate as the load-bearing guarantee) explicitly carried as constraints, not silently assumed? [Assumption, Spec §Assumptions]

## Measurability of Success Criteria

- [ ] CHK025 - Is SC-001 ("100% of verbs and sub-actions return usage on --help, exit 0") objectively countable against the command tree? [Measurability, Spec §SC-001]
- [ ] CHK026 - Are SC-002/003 ("zero hand-edits / zero source reads" across a lifecycle walkthrough) defined so "zero" is observable? [Measurability, Spec §SC-002/003]
- [ ] CHK027 - Is SC-006 ("non-zero naming the gap") specific enough that a passing guardrail and a failing one are distinguishable by output, not just exit code? [Measurability, Spec §SC-006]
- [ ] CHK028 - Is SC-007 ("interceptor provably loaded and firing") tied to a concrete observable (registration + a deny on a fronted-no-marker payload)? [Measurability, Spec §SC-007]

## Edge & Boundary Coverage

- [ ] CHK029 - Are requirements defined for a deprecated verb/alias (speckit-guard, check-editor-symmetry) so the guardrail treats it as documented, not a gap? [Edge Case, Spec §Edge Cases]
- [ ] CHK030 - Are requirements defined for a fronted op that is an in-session /speckit-* step (not a stackctl verb) so the registry can enumerate it? [Coverage, Spec §FR-051]
- [ ] CHK031 - Is the behavior specified for a verb that accepts only a subset of a shared status/grammar vocabulary (help must show the subset)? [Edge Case, Spec §Edge Cases]
- [ ] CHK032 - Are nested/parallel backend-drive marker semantics carried as a preserved invariant (each gets its own token; one exit never clears another's)? [Consistency, Spec §Assumptions]

## Notes

- This is a requirements-quality checklist (does the spec SAY the right things, completely and unambiguously) — NOT a test plan for the implementation.
- CHK011 and CHK014 are the two highest-value "silent drop / drift" tripwires given the operator's framing of how this feature came to exist.
