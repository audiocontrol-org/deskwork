# Requirements Quality Checklist: Backlog slush-pile surface

**Purpose**: Unit-test the *requirements* (spec.md) for completeness, clarity, consistency, measurability, and coverage — before `/speckit-tasks`. Focus clusters: intake & migration integrity, and fail-loud/error coverage. This validates how the requirements are WRITTEN, not whether the implementation works.
**Created**: 2026-06-09
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [ ] CHK001 Are requirements defined for what minimal data a captured item must carry (title, type) vs. what is optional (ref, body)? [Completeness, Spec §FR-001/FR-002]
- [ ] CHK002 Is the full set of intake sources enumerated, and is each one's trigger (ongoing vs. one-time) specified? [Completeness, Spec §US1/US3/US4]
- [ ] CHK003 Are requirements defined for how an imported item's provenance is recorded for BOTH intake imports (GitHub backlink vs. audit-log/barrage link)? [Completeness, Spec §FR-011/FR-016]
- [ ] CHK004 Does the spec state what the GitHub import reads from each issue (which issue attributes are in scope)? [Completeness, Spec §US3]
- [ ] CHK005 Are requirements defined for the audit-log entry's post-migration state (what replaces the parked status)? [Completeness, Spec §FR-020]
- [ ] CHK006 Is the disposition of the removed `--burn-down` capability specified (what replaces it)? [Completeness, Spec §FR-022]

## Requirement Clarity & Measurability

- [ ] CHK007 Is "one move" / "without losing the current thread" expressed as an objectively checkable property rather than a feeling? [Clarity/Measurability, Spec §FR-001, SC-001]
- [ ] CHK008 Is "separate from the curated roadmap" defined concretely enough to verify (e.g., the roadmap artifact is provably unwritten)? [Measurability, Spec §FR-004, SC-002]
- [ ] CHK009 Is "idempotent" defined in observable terms (re-run produces zero new items) rather than left abstract? [Clarity, Spec §FR-012/FR-021, SC-003]
- [ ] CHK010 Is "durable, human-readable written artifacts versioned in the working tree" specific enough to accept/reject a candidate store? [Clarity, Spec §FR-005]
- [ ] CHK011 Can "fails with a descriptive error naming what is missing and how to remedy it" be objectively evaluated (names dependency + remediation)? [Measurability, Spec §FR-023]
- [ ] CHK012 Is the severity→priority mapping requirement specified well enough to be testable, or only named? [Clarity, Spec §FR-019]

## Requirement Consistency

- [ ] CHK013 Is the item `type` vocabulary consistent between the FRs (bug/gap) and Key Entities (bug/gap/imported-issue/migrated-finding)? [Consistency, Spec §FR-002 vs Key Entities]
- [ ] CHK014 Do "capture ≠ scope" (no triage on capture) and the priority field assignment for migrated findings coexist without contradiction? [Consistency, Spec §FR-003 vs FR-019]
- [ ] CHK015 Is the audit-log boundary stated consistently — US4 mutates the slush portion while FR-025 says the non-slush audit-log is untouched? [Consistency, Spec §US4 vs FR-025]
- [ ] CHK016 Are the "GitHub not mutated" statements consistent across the user story, FRs, and success criteria? [Consistency, Spec §US3/FR-010/SC-004]
- [ ] CHK017 Is terminology stable (backlog / slush pile / captured item / parked finding / migrated-finding) with no undefined synonyms? [Consistency/Terminology]

## Scenario & Edge-Case Coverage

- [ ] CHK018 Are requirements defined for an empty/blank capture (missing title or type)? [Edge Case, Spec §Edge Cases]
- [ ] CHK019 Are requirements defined for a GitHub issue whose body contains `#` / markdown control characters? [Edge Case, Spec §FR-015]
- [ ] CHK020 Are requirements defined for re-running each import (GitHub AND slush backfill) more than once? [Coverage, Spec §FR-012/FR-021]
- [ ] CHK021 Are requirements defined for the GitHub-CLI-missing / unauthenticated path distinctly from the backing-store-missing path? [Coverage, Spec §FR-023, Edge Cases]
- [ ] CHK022 Are requirements defined for a non-zero result from an underlying operation (surface + propagate, no silent success)? [Exception Flow, Spec §FR-024]
- [ ] CHK023 Is the HIGH-severity exclusion ("never slushed") stated as an invariant the migration must preserve, not just current behavior? [Coverage, Spec §FR-018, SC-005]
- [ ] CHK024 Are requirements defined for capture while many items already exist (no reorder/disturbance of siblings)? [Coverage, Spec §FR-006]
- [ ] CHK025 Is the dampener "when to park" decision explicitly scoped OUT of this feature's changes (destination-only)? [Coverage, Spec §FR-017]

## Acceptance Criteria Quality

- [ ] CHK026 Does each success criterion map to at least one functional requirement and remain technology-agnostic? [Acceptance Criteria, Spec §SC-001..SC-007]
- [ ] CHK027 Is SC-002 ("byte-for-byte unchanged") objectively verifiable as written? [Measurability, Spec §SC-002]
- [ ] CHK028 Is SC-006 ("no indefinitely-parked slush statuses remain") verifiable against the audit-log after migration? [Measurability, Spec §SC-006]

## Dependencies, Assumptions & Boundaries

- [ ] CHK029 Are the settled substrate + surface decisions (backlog.md; skill+CLI not MCP) recorded as assumptions/dependencies rather than leaking into FRs as HOW? [Traceability, Spec §Assumptions]
- [ ] CHK030 Is the external dependency on the GitHub CLI documented as an assumption? [Assumption, Spec §Assumptions]
- [ ] CHK031 Are all named deferrals (MCP, backend port, ROADMAP promotion seam, GitHub close/migrate, concurrency IDs, dependency-graph overlay) explicitly recorded so none is a silent cut? [Completeness, Spec §Out of Scope]
- [ ] CHK032 Is the additive boundary (inbox/roadmap/non-slush audit-log untouched) stated as a requirement, not only an assumption? [Boundary, Spec §FR-025]

## Notes

- Check items off as the spec is confirmed to satisfy each. Any unchecked item is a spec gap to resolve before `/speckit-tasks` (or an explicit operator deferral).
- This is the requirements-quality gate; the auto-generated `requirements.md` is the spec-template completeness gate. Both live under `checklists/`.
