# Checklist: Closure correctness + terminal-stage safety

**Purpose**: Validate that the requirements for the transitive closer, the
operator-confirm guard, the phase-derivation clean break, and the install-agnostic
invariant are complete, clear, consistent, and measurable — BEFORE implementation.
**Created**: 2026-06-23
**Feature**: [spec.md](../spec.md)

> "Unit tests for English" — every item tests the REQUIREMENTS, not the
> implementation.

## Closure correctness — completeness & coverage

- [ ] CHK001 - Is the set of ids the cascade may close explicitly bounded to recorded `closes:` ∪ `ref:` (no inference from prose), so over-close is impossible by requirement? [Completeness, Spec §FR-005]
- [ ] CHK002 - Are the requirements clear that the cascade reaches EVERY terminal node in the `part-of` subtree (no under-close), and is "subtree" defined via the `part-of` reverse edge? [Completeness, Spec §FR-001/FR-006]
- [ ] CHK003 - Is the multi-parent/diamond dedup requirement specified with an explicit "visited exactly once" guarantee and a termination argument? [Clarity, Spec §FR-002]
- [ ] CHK004 - Are the requirements for a non-terminal child unambiguous — skipped, reported in the plan, ids NOT closed, and the parent still allowed to close? [Clarity, Spec §FR-007a, Edge Cases]
- [ ] CHK005 - Is "uniform terminal handling" of `cancelled`/`retired` members fully specified — their ids close, the closure reason reflects their status, and the walk descends into their children? [Completeness, Spec §FR-007, Edge Cases]
- [ ] CHK006 - Is idempotence specified for a re-run — an already-`Done` id reported (not errored) and the run still succeeds? [Measurability, Spec §FR-004, SC-007]
- [ ] CHK007 - Are the requirements for an unknown recorded id defined (surfaced in dry-run, apply refused, no partial close)? [Edge Case, Spec §Edge Cases / contracts/close-cascade]
- [ ] CHK008 - Is the behavior for an empty `closes:` on an interior node specified (contributes none, walk continues)? [Coverage, Spec §Edge Cases]

## Operator-confirm guard — clarity & consistency

- [ ] CHK009 - Is "no automatic closure" stated as an invariant, with the only mutation path being an explicit operator action? [Clarity, Spec §FR-016, SC-004]
- [ ] CHK010 - Are the dry-run contents specified (nodes, skipped children, deduped closeIds, alreadyClosed, unknownIds) so the operator sees the full plan before confirming? [Completeness, Spec §contracts/close-cascade, data-model CascadePlan]
- [ ] CHK011 - Is the confirm surface unambiguous and singular (`advance --to closed` with explicit `--apply`), with no second auto-firing path? [Consistency, Spec §FR-016]
- [ ] CHK012 - Is the relationship between `close-related --cascade` (closes ids) and `advance --to closed` (closes ids + sets status) specified without overlap/ambiguity? [Consistency, Spec §contracts/close-cascade]

## Phase-derivation clean break — safety

- [ ] CHK013 - Is the requirement explicit that the `status === shipped → last-phase` special-case is REMOVED (not kept as a fallback) and replaced by a status→phase by-name mapping? [Clarity, Spec §FR-014]
- [ ] CHK014 - Is there a requirement that NO consumer continues to treat `shipped` as terminal after the change (i.e., the lifecycle surfaces `shipped` as not-yet-closed)? [Completeness, Spec §FR-013]
- [ ] CHK015 - Are the compass rules specified for the new phase — `shipped → closed` legitimate, and `closed` refused from any non-`shipped` phase? [Completeness, Spec §FR-015, contracts/terminal-stage]
- [ ] CHK016 - Is the grammar change specified (add `closed` to BOTH `statusVocabulary` and `terminalStatuses`) so `close-related`/`advance` accept it uniformly? [Completeness, Spec §FR-012, research §R6]
- [ ] CHK017 - Is `closed` defined as a terminal phase with no legitimate outgoing move, and distinguished from the `cancelled`/`retired` side-states (reached on-rail)? [Clarity, Spec §contracts/terminal-stage, data-model]

## Install-agnostic invariant

- [ ] CHK018 - Is it explicitly required that NO stage (including `closed`) carries a post-install/release validation entrance criterion? [Clarity, Spec §FR-017]
- [ ] CHK019 - Is the deadlock-prevention requirement stated structurally — no `tasks.md`-resident validation task and no blocking criterion governance can wait on? [Completeness, Spec §FR-018, SC-006]
- [ ] CHK020 - Is it specified that an installation with no install/release step can reach `closed` with nothing blocking it? [Coverage, Spec §SC-005, US3]
- [ ] CHK021 - Is the scope boundary clear that what the operator inspects before confirming is OUTSIDE the workflow's contract (not modeled, not enforced)? [Clarity, Spec §FR-017, Clarifications]

## `closes:` population & auto-back-link — completeness

- [ ] CHK022 - Are the `roadmap resolves` add/remove semantics specified (set-union/difference, canonical comma-list, dry-run/apply)? [Completeness, Spec §FR-008/FR-009, contracts/roadmap-resolves]
- [ ] CHK023 - Is it explicit that `closes:` population does NOT route through `add-edge` (prose field vs unit edge) and why? [Clarity, Spec §research R4]
- [ ] CHK024 - Is the optional parent-node ref specified (storage, that absence is a no-op not an error, idempotent back-link)? [Completeness, Spec §FR-010/FR-011, contracts/backlog-parent-node]
- [ ] CHK025 - Is it specified that `resolves --add` does NOT validate the id against the backlog at add-time (validation deferred to close-time `unknownIds`)? [Consistency, Spec §contracts/roadmap-resolves]

## Traceability & acceptance

- [ ] CHK026 - Does every functional requirement (FR-001..FR-018) have at least one acceptance scenario or success criterion it can be verified against? [Traceability, Spec §User Scenarios / Success Criteria]
- [ ] CHK027 - Are the resolved clarifications (confirm surface, partial subtree, cancelled/retired) reflected consistently across spec FRs, edge cases, contracts, and data-model (no stale "NEEDS CLARIFICATION")? [Consistency, Spec §Clarifications]

## Notes

- This checklist gates `/speckit-tasks`: any unchecked item indicates a requirement
  to tighten in the spec before decomposition. Items are requirement-quality
  questions, not implementation tests.
