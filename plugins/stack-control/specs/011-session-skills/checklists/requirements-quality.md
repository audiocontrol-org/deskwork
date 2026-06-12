# Requirements Quality Checklist: session-skills

**Purpose**: Validate the *quality* of the requirements in `spec.md` (completeness / clarity / consistency / measurability / coverage) before implementation — "unit tests for the English," not implementation tests.
**Created**: 2026-06-10
**Feature**: [spec.md](../spec.md)
**Focus clusters**: (1) decoupling/config-resolution integrity · (2) fail-loud vs degrade-cleanly · (3) local-backlog-not-GitHub-issues · (4) two-session boundary + read-only/advisory invariants · (5) CLI-first/surface-agnostic.

## Decoupling / config-resolution integrity

- [ ] CHK001 - Is the complete set of working files that MUST resolve through the installation config enumerated unambiguously (roadmap, inbox, journal, tooling-feedback, audit log, clone-scope)? [Completeness, Spec §FR-012]
- [ ] CHK002 - Is "resolve through the config" distinguished from "hardcoded path / branch name / feature slug" with enough specificity that a reviewer can identify a violation? [Clarity, Spec §FR-012]
- [ ] CHK003 - Are the three new config keys this feature owns (journal, tooling_feedback, clone_scope) each given a default and a resolution precedence? [Completeness, contracts/session-config-extension.md]
- [ ] CHK004 - Is the boundary "extends 009's shared contract, NOT coupled to 009's implementation" stated as a bounded, verifiable scope statement (a dependency edge, not a code dependency)? [Clarity, Spec §Assumptions, §Dependencies]
- [ ] CHK005 - Is it stated consistently that ONE shared config per installation is used (not a separate session-skills config)? [Consistency, contracts/session-config-extension.md]
- [ ] CHK006 - Is "no baked-in journal taxonomy / document model / renderer" expressed measurably (configured template else a documented default)? [Measurability, Spec §FR-013]
- [ ] CHK007 - Is the nearest-enclosing-installation resolution (monorepo) specified consistently for BOTH verbs, including the explicit `--at` override? [Consistency, Spec §FR-015, §FR-020]

## Fail-loud vs. degrade-cleanly

- [ ] CHK008 - Are the two postures (hard fail-loud vs. clean-skip degradation) each scoped to specific named conditions with no overlap? [Consistency, Spec §FR-014, §FR-017]
- [ ] CHK009 - Is every fail-loud condition enumerated (invoked outside any installation; a required working file unreadable/malformed)? [Completeness, Spec §FR-014, Edge Cases]
- [ ] CHK010 - Is every clean-skip condition enumerated (staleness base undeterminable / detached HEAD; clone-snapshot scope unconfigured / tool absent)? [Completeness, Spec §FR-017, Edge Cases]
- [ ] CHK011 - Is a clean skip required to be ANNOUNCED (a named skip, not a silent omission), so it is distinguishable from a fabrication? [Clarity, Spec §Edge Cases, §FR-008]
- [ ] CHK012 - Is the push-failure posture (surface it + non-zero exit, record committed locally) stated unambiguously versus a clean close? [Clarity, Spec §Edge Cases, contracts/session-end-cli.md]
- [ ] CHK013 - Do any requirements conflate "fail loud" and "degrade cleanly" for the same condition? [Conflict]
- [ ] CHK014 - Is "no silent bundled-copy fallback" stated as an explicit prohibition (not merely implied)? [Clarity, Spec §FR-014, §SC-004]

## Local backlog, not GitHub issues

- [ ] CHK015 - Is "the skills make zero GitHub-issue references at runtime" stated as a checkable requirement (a measurable 0), not only prose? [Measurability, Spec §FR-001, §FR-009, §SC-006]
- [ ] CHK016 - Are session-start (open items) and session-end (progressed items) each specified as to WHICH backlog items they surface? [Completeness, Spec §FR-001, §FR-009]
- [ ] CHK017 - Is "progressed this session" defined precisely enough to be verifiable, or is the derivation basis left ambiguous at the spec level? [Ambiguity, Spec §FR-009]
- [ ] CHK018 - Is "0 automated status transitions; the operator owns the transition" stated consistently across the FRs and the success criteria? [Consistency, Spec §FR-009, §SC-006]
- [ ] CHK019 - Are the provenance issue citations (#122 / #422) clearly scoped as rationale-only so they do not read as a runtime GitHub-issue reference? [Clarity, Spec §Context, §Assumptions]

## Two-session boundary + read-only / advisory invariants

- [ ] CHK020 - Is "session-start reports and STOPS; never invokes a /speckit-* or implementation step" a single verifiable requirement? [Measurability, Spec §FR-002, §FR-021]
- [ ] CHK021 - Is "session-start is read-only / 0 on-disk changes" stated measurably (re-run yields an identical report)? [Measurability, Spec §FR-004, §SC-008]
- [ ] CHK022 - Is "branch-staleness is advisory and never blocks" stated as an invariant across ALL branches of the staleness outcome (behind / level / undeterminable)? [Coverage, Spec §FR-016, §SC-005]
- [ ] CHK023 - Are the orchestrator vs. implementation session roles defined clearly enough that "session-start must not run authoring" is unambiguous? [Clarity, Spec §FR-021]
- [ ] CHK024 - Is the read-only guarantee consistent with session-start reading the active spec, journal, and backlog (reads only, no writes)? [Consistency, Spec §FR-001, §FR-004]

## CLI-first / surface-agnostic

- [ ] CHK025 - Is "fully invocable via stackctl with no Claude-Code-only path" stated with measurable acceptance (runs to completion in a plain shell)? [Measurability, Spec §FR-018, §SC-007]
- [ ] CHK026 - Is "skills are thin adapters that add no behavior the CLI lacks" expressed as a verifiable equivalence (skill output == CLI output)? [Clarity, Spec §FR-019]
- [ ] CHK027 - Is the surface-agnostic invocation context (cwd today; client-supplied root later; `--at`) defined without baking in a specific host surface? [Consistency, Spec §FR-020]

## Acceptance criteria, coverage & assumptions (cross-cutting)

- [ ] CHK028 - Does every P1 user story (US1–US3) carry at least one independently-testable acceptance scenario? [Acceptance Criteria, Spec §User Scenarios]
- [ ] CHK029 - Are the no-active-spec, first-session/empty-journal, and partial-authoring-chain states each specified as graceful "none" signals? [Coverage, Spec §FR-005, Edge Cases]
- [ ] CHK030 - Is "concise report" bounded enough to avoid subjectivity, or is report conciseness left as an unquantified adjective? [Ambiguity, Spec §FR-001]
- [ ] CHK031 - Is the "honest sparse entry" requirement defined measurably (always written; minimum content), so an empty session still produces a record? [Clarity, Spec §FR-006]
- [ ] CHK032 - Is the mechanism by which tooling-friction content is supplied to session-end specified, or explicitly deferred to plan/contracts? [Gap, Spec §FR-007]
- [ ] CHK033 - Is the 009 build-order dependency documented as an assumption/edge rather than an unstated prerequisite? [Assumption, Spec §Dependencies, plan §Dependency-sequencing note]
- [ ] CHK034 - Is the chain-position inference's reliance on the Spec-Kit `.specify/feature.json` pointer recorded (concretely Spec-Kit-based; provider port deferred), so the coupling is intentional and bounded? [Assumption, Spec §FR-003, research D4]

## Notes

- These items test whether the requirements are well-written, not whether the implementation works. Resolve any item that surfaces a genuine gap/ambiguity/conflict via a spec edit before `/speckit-implement`.
- CHK017, CHK030, CHK032 correspond to the three LOW findings from `/speckit-analyze` (U1) and the promise-altitude choices — each is intentionally deferred to plan/contracts, not a spec defect; the checklist records them so the implementation session confirms rather than rediscovers them.
- Traceability: ≥80% of items carry a `[Spec §…]`, contract, or `[Gap]`/`[Ambiguity]`/`[Assumption]`/`[Conflict]` marker.
