# Requirements Quality Checklist: Tier-annotation correctness & completeness

**Purpose**: Unit-test the REQUIREMENTS (not the implementation) for the model-tier-task-annotation feature — are they complete, clear, consistent, measurable, and edge-covered?
**Created**: 2026-07-08
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [data-model.md](../data-model.md)

## Born-complete guarantee, deterministic floor, no-silent-default

- [ ] CHK001 - Is the "born tier-complete" outcome stated as a testable requirement (every task carries a resolvable `[tier:]`) rather than an aspiration? [Measurability, Spec §FR-005]
- [ ] CHK002 - Is the deterministic `resolve-tiers` floor required to remain UNCHANGED, and is "unchanged" pinned to a concrete invariant (fail-loud, dispatch-nothing, named error)? [Clarity, Spec §FR-006]
- [ ] CHK003 - Is the no-silent-default invariant expressed so it can be falsified by a test (removing a tag ⇒ execute refuses)? [Measurability, Spec §US4, SC-004]
- [ ] CHK004 - Are the two failure categories the floor emits (`no-tier` vs `unknown-tier`) each named and distinguished in the requirements? [Completeness, Spec §US4]
- [ ] CHK005 - Is it explicit that born-complete is achieved by proposing a REAL tier, never by defaulting an unresolved task at dispatch? [Consistency, Spec §Assumptions, FR-006]
- [ ] CHK006 - Do the requirements state that 033's deferred configurable-default-tier remains deferred (this feature adds no default)? [Consistency, Spec §Assumptions]

## Vocabulary awareness (FR-003) & ranking-binding rules (FR-004a)

- [ ] CHK007 - Is the requirement that proposed labels come ONLY from the installation's actual `tier_map` stated as a hard MUST, with the hardcoded-vocabulary anti-case called out? [Clarity, Spec §FR-003]
- [ ] CHK008 - Is the source of the model-capability ranking specified unambiguously (a declared ordering, not implicit Set iteration)? [Clarity, Spec §FR-004a, plan §Research]
- [ ] CHK009 - Is the even-count median rule defined deterministically (which of the two middles is chosen)? [Completeness, Data-model §Tier ranking]
- [ ] CHK010 - Is the two-label collapse rule specified (which bucket `mid` collapses onto) with a stated rationale? [Completeness, Data-model §Tier ranking]
- [ ] CHK011 - Is tie-breaking defined when two labels resolve to the same model or share a rank? [Edge Case, Data-model §Tier ranking]
- [ ] CHK012 - Is `fable`'s placement in the capability order specified, and is it clear this is a declared deterministic ordering, not an absolute-capability claim? [Ambiguity, Spec §FR-004a]
- [ ] CHK013 - Are the heuristic's task-nature buckets (mechanical/RED/doc, standard, cross-cutting/architectural/ambiguous/high-blast-radius) enumerated without overlap ambiguity? [Clarity, Spec §FR-004]
- [ ] CHK014 - Is single-label-map behavior specified (all three buckets bind to the one label)? [Coverage, Data-model §Tier ranking]

## No-tier_map behavior (FR-009)

- [ ] CHK015 - Is the no-`tier_map` behavior fully specified for all three effects: loud advisory, explicit `[tier:UNSET]` sentinel, and non-blocking generation? [Completeness, Spec §FR-009]
- [ ] CHK016 - Is it required that no label is invented and no silent default introduced in the no-`tier_map` path? [Consistency, Spec §FR-009, FR-006]
- [ ] CHK017 - Is the advisory's required content specified (names the missing `tier_map` + the config path to fix)? [Clarity, Spec §FR-009]
- [ ] CHK018 - Is the interaction between `[tier:UNSET]` and the existing floor specified (UNSET is not a `tier_map` key ⇒ floor refuses at execute)? [Coverage, Spec §FR-009, plan §Research]
- [ ] CHK019 - Is the edge where a `tier_map` literally contains a label named `UNSET` addressed or explicitly deemed out of scope? [Edge Case, plan §Research]
- [ ] CHK020 - Is the `tier-vocab` verb's exit-code contract for the absent case specified (exit 0 so the seam proceeds, not a hard refusal)? [Clarity, Contracts §tier-vocab-verb]

## Single-sourcing & drift guard (FR-011 / FR-012)

- [ ] CHK021 - Is single-sourcing stated as a MUST (both the seam injection and the template exemplification derive from one source)? [Clarity, Spec §FR-012]
- [ ] CHK022 - Since a static template cannot call the render function, is the drift-guard mechanism (shared constants + a test) specified as the realization of FR-012? [Completeness, Spec §FR-012, Contracts §render-tier-requirement]
- [ ] CHK023 - Are the specific invariants the drift test checks enumerated (canonical syntax + heuristic strings present in the template)? [Measurability, Contracts §render-tier-requirement]
- [ ] CHK024 - Is FR-011's relationship to FR-002 stated (template exemplification COMPLEMENTS, does not replace, the load-bearing seam injection)? [Consistency, Spec §FR-011]
- [ ] CHK025 - Is the required content of the rendered block specified completely (syntax, heuristic, concrete bucket bindings, UNSET instruction)? [Completeness, Contracts §render-tier-requirement]

## Operator override (FR-007) & seam capability-neutrality (FR-002)

- [ ] CHK026 - Is operator override specified as a MUST, including that a reviewed/edited `tasks.md` is not clobbered by generation without operator action? [Completeness, Spec §FR-007]
- [ ] CHK027 - Is the override outcome measurable (an edited tier is what execute dispatches on)? [Measurability, Spec §SC-005, US3]
- [ ] CHK028 - Is the seam requirement explicit that injection MUST NOT branch on which backend authors tasks (capability, not vendor)? [Clarity, Spec §FR-002, Constitution III]
- [ ] CHK029 - Is the syntactic-compatibility requirement stated (injected `[tier:]` coexists with `[P]`/`[US n]` sibling tags and parses under the existing parser)? [Coverage, Spec §FR-008]

## Consistency, scope, and traceability

- [ ] CHK030 - Do the Success Criteria (SC-001..SC-005) each trace to at least one functional requirement without contradiction? [Consistency, Spec §Success Criteria]
- [ ] CHK031 - Is the scope boundary between "producing side + seam" (in scope) and "consuming machinery" (unchanged) stated unambiguously? [Clarity, Spec §Assumptions]
- [ ] CHK032 - Are the three Clarifications-session decisions reflected consistently in the FRs they touch (FR-009, FR-004a/FR-010, FR-011/FR-012)? [Consistency, Spec §Clarifications]

## Notes

- This checklist tests whether the REQUIREMENTS are well-written (complete/clear/consistent/measurable/edge-covered) — not whether the implementation works. Implementation correctness is `/speckit-analyze` + the RED tests enumerated in plan §Testing Strategy.
- Any unchecked item after review indicates a spec/plan gap to close before `/speckit-tasks` finalizes, or a deliberate out-of-scope note to record.
