# Checklist: Capability-mediation requirements-quality gate

**Purpose**: Unit-test the REQUIREMENTS (not the implementation) for the five highest-risk areas before tasks/implementation. Each item asks whether the spec is complete, clear, consistent, and measurable.
**Created**: 2026-06-17
**Feature**: [spec.md](../spec.md)

## Complete-mediation invariant

- [ ] CHK001 - Is "fronted backend" defined precisely enough that an implementer can enumerate exactly which invocations are in scope? [Clarity, Spec §FR-001]
- [ ] CHK002 - Does the spec state unambiguously that READS (not only mutations) are refused without the marker? [Completeness, Spec §FR-002, §Decision 1]
- [ ] CHK003 - Are both fronted surfaces (in-session `Skill` invocations AND Bash-invoked CLIs) covered by an explicit requirement, with neither left implicit? [Coverage, Spec §FR-001]
- [ ] CHK004 - Is the permit path (a marker-bearing call MUST pass) specified as a first-class requirement, not only implied by the refuse path? [Completeness, Spec §FR-004]
- [ ] CHK005 - Is the redirect-message obligation (a refusal MUST name the interface to use) measurable — i.e. is the source of the named interface specified? [Measurability, Spec §FR-003]
- [ ] CHK006 - Does the spec define the behavior for an identity that is NOT a fronted backend (permit), so "no registry match" is distinguished from "refuse"? [Edge Case, Spec §data-model MediationDecision]
- [ ] CHK007 - Is self-application (a maintainer's own reach-around is refused) stated as a requirement, not just an assumption? [Completeness, Spec §FR-019, §SC-007]

## Precise identity matching (zero false positives)

- [ ] CHK008 - Is "precise identity" defined with a concrete rule (normalized `argv[0]`) rather than the vague "not substring"? [Clarity, Spec §FR-005]
- [ ] CHK009 - Are the false-positive cases that MUST NOT refuse (backend name in a path / argument / comment) enumerated as requirements? [Coverage, Spec §FR-005, §Edge Cases]
- [ ] CHK010 - Is the skill-surface matching rule (exact skill-name membership) specified distinctly from the CLI rule? [Completeness, Spec §FR-005, §data-model BackendIdentity]
- [ ] CHK011 - Is the zero-false-positive success criterion measurable against a defined representative collision set, not a subjective "no false positives"? [Measurability, Spec §SC-003]
- [ ] CHK012 - Are wrapper/alias forms (e.g. `env`, `sudo`, relative paths) addressed in the normalization requirement, or explicitly out of scope? [Edge Case, Spec §research D4]

## Marker-file lifecycle correctness

- [ ] CHK013 - Is the marker propagation mechanism pinned to a single mechanism (file), with the rejected alternative (env var) recorded so it can't silently reappear? [Consistency, Spec §FR-014, §Clarifications]
- [ ] CHK014 - Are staleness requirements quantified (what makes a marker stale; what a reader does with one) rather than left as "handle staleness"? [Clarity, Spec §FR-014a]
- [ ] CHK015 - Is the nesting/concurrency requirement specified so that one front-door teardown provably cannot clear another's live marker? [Completeness, Spec §FR-014a, §data-model FrontDoorMarker]
- [ ] CHK016 - Is session-keying specified as a requirement (cross-session leakage prevented), and is the key source identified? [Coverage, Spec §data-model FrontDoorMarker]
- [ ] CHK017 - Is the crash/abort case (a front-door skill dies before teardown) addressed so a leaked marker cannot sanction a later raw call? [Edge Case, Spec §FR-014a]
- [ ] CHK018 - Does the spec require the marker write to honor the installation-anchor invariant rather than a free/tmp location? [Consistency, Spec §plan Constitution Check]

## Cross-vendor / capability-not-vendor purity

- [ ] CHK019 - Is the requirement that decision logic lives in `stackctl` and branches on capability/identity (never vendor) stated as testable, not aspirational? [Measurability, Spec §FR-006]
- [ ] CHK020 - Is the prohibition on a hardcoded Claude-only `.claude/skills` path captured as an explicit requirement? [Completeness, Spec §FR-006]
- [ ] CHK021 - Is cross-vendor parity (same verdict + exit code across adapters) specified with a measurable criterion? [Measurability, Spec §SC-005]
- [ ] CHK022 - Does the spec state HONESTLY what Codex can and cannot intercept at v1 (Bash-only), so the parity requirement isn't overclaimed? [Consistency, Spec §research D8, §US4]
- [ ] CHK023 - Is the exit-code contract (1 refuse / 0 permit / 2 usage) specified identically for every adapter and the core verb? [Consistency, Spec §FR-007]

## No-git-hook enforcement-surface ruling

- [ ] CHK024 - Is the enforcement-surface requirement (plugin-shipped hook that travels with `claude plugin install`) stated, and the forbidden surface (`.husky`/`.git/hooks`) explicitly excluded? [Completeness, Spec §FR-008, §Decision 5]
- [ ] CHK025 - Is the rationale that satisfies the no-git-hook ADR recorded in the spec (not only in the design record), so the ruling is traceable? [Traceability, Spec §Decision 5]
- [ ] CHK026 - Is the obligation to amend `.claude/rules/enforcement-lives-in-skills.md` + the ADR captured as in-scope work rather than an unowned aside? [Gap, Spec §Decision 5]

## Cross-cutting requirement quality

- [ ] CHK027 - Are the three RESOLVED clarifications reflected consistently everywhere they touch (no lingering "process env" or "all capabilities" text contradicting the decisions)? [Conflict, Spec §Clarifications]
- [ ] CHK028 - Are the three OPEN questions (Codex mechanism, Approach-A fallback, provider port) marked as open with an owner/phase, so none reads as silently settled? [Completeness, Spec §Open Questions]
- [ ] CHK029 - Is each Functional Requirement traceable to at least one acceptance scenario or success criterion? [Traceability, Spec §FR-*, §SC-*]
- [ ] CHK030 - Is the v1 capability boundary (exactly three; three excluded) stated so an implementer cannot accidentally widen it? [Clarity, Spec §FR-017]

## Notes

- This is a requirements-quality gate, not a test plan. Items ask "is X specified well?", not "does X work?".
- Resolve or consciously accept each item before `/speckit-tasks`. Unchecked items are spec gaps to fix or explicitly defer.
