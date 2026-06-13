# Checklist: Isolation Invariant, Fail-Loud, and Contract Testability — Requirements Quality

**Purpose**: Unit-test the anchor-unification requirements (spec.md + contracts) for completeness, clarity, consistency, and measurability across the three operator-named focus areas — before `/speckit-tasks`
**Created**: 2026-06-12
**Feature**: [spec.md](../spec.md)

## Isolation Invariant Completeness

- [x] CHK001 - Is "domain" defined with an objective membership rule that classifies EVERY path on disk as inside exactly one domain or no domain? [Clarity, Spec §Key Entities, FR-013]
- [x] CHK002 - Is the enumeration of stack-control-owned state in FR-001 (feature root, run-dir, audit-log, backlog store, slush routing, payload exclusion, advisories, configuration) exhaustive — e.g. are scope-discovery registries (clones baseline, scope manifests) and the program audit log classified? [Completeness, Gap, FR-001]
- [x] CHK003 - Is the no-overlap invariant specified at BOTH enforcement boundaries (refusal at creation; loud detection at resolution) with distinct required behavior for each? [Completeness, FR-013, SC-009]
- [x] CHK004 - Is behavior defined for overlapping state that arises WITHOUT setup (a marker copied in by git operations) — i.e. is detection-at-resolution required to catch what creation-refusal cannot? [Edge Case, Spec §Edge Cases]
- [x] CHK005 - Does FR-013's prohibition ("no verb … reads or writes any file owned by another domain, an enclosing directory, the repo root, or the git toplevel") conflict with govern's necessary READS of the audited codebase (the diff, source files), which live outside `.stack-control/`-owned state? Is "stack-control-owned state" vs "code under audit" distinguished? [Conflict, FR-013 vs US1]
- [x] CHK006 - Is the `STACKCTL_BACKLOG_DIR` pierce's scope precisely bounded — which resolutions it displaces (store location) and which it must NOT displace (audit-log lookup, advisories, config)? [Clarity, Spec §Edge Cases, §Assumptions]
- [x] CHK007 - Are FR-001 (everything derives from one domain) and the env-override edge case (an explicit cross-domain store) reconciled in the requirement text rather than only in the contract file? [Consistency, FR-001, contracts/cli-at-flag.md]
- [x] CHK008 - Is "domain" vs "installation" terminology applied consistently across all FRs, stories, and contracts (per the Key Entities canonical-term note)? [Consistency, Spec §Key Entities]
- [x] CHK009 - Are requirements defined for what becomes of EXISTING domains created before this feature (no seeded config, old wording expectations) — is post-upgrade behavior on old domains specified? [Coverage, Gap]

## Fail-Loud Coverage

- [x] CHK010 - Does every silent-degradation path named in the nine defects have a corresponding loud-failure or loud-report requirement (slush non-fatal exit-1; inert exclusion; config fall-through; toplevel fallback; false promote advisory; fixture real-state writes)? [Coverage, FR-012, FR-002/003/004/007/008/010]
- [x] CHK011 - Is the overlap error's required content specified measurably (MUST name every discovered root; MUST NOT carry the setup-remediation class)? [Clarity, FR-013, contracts/resolver-error-wording.md]
- [x] CHK012 - Is the not-found wording class's trigger specified as exactly one condition (no-enclosing-domain) for ALL verbs — and is the today-divergent set (2 gated / 6 unconditional) enumerated so the fix is verifiable? [Clarity, FR-009, SC-005]
- [x] CHK013 - Are remediation contents defined per error class (setup for not-found; named roots for overlap; verbatim pass-through for malformed config)? [Completeness, FR-009, FR-013]
- [x] CHK014 - Are exit-code requirements specified for the NEW failure modes (overlap at resolution, setup-refusal on overlap, govern sub-step divergence, inert-exclusion error), or only stderr wording? [Gap, FR-002, FR-003, FR-013]
- [x] CHK015 - Is behavior specified when `--at` names a directory that does not exist (vs an existing directory outside any domain)? [Edge Case, Gap, FR-006]
- [x] CHK016 - Is FR-002's "fails loudly naming the divergence" measurable — does a requirement define what the message must identify (which sub-step, which two roots)? [Measurability, FR-002]
- [x] CHK017 - Is the config-source report's required form specified (where it appears, its two values) so its absence is detectable as a defect? [Clarity, FR-004, SC-003]

## Contract Testability

- [x] CHK018 - Can SC-002 be objectively decomposed — are the three invocation classes (cwd-driven, flag-driven, env-overridden) each tied to a concrete scenario with an observable pass condition? [Measurability, SC-002, US1]
- [x] CHK019 - Is SC-004's "byte-equivalent modulo timestamps/ids" defined precisely enough to automate (which fields are exempt, how output is normalized)? [Measurability, SC-004]
- [x] CHK020 - Is the resolver-consuming verb set enumerated in one authoritative place so SC-005's "100% / 0%" is countable — and is the assumption that seven is the complete set validated against the dispatcher inventory? [Measurability, Assumption, SC-005]
- [x] CHK021 - Does FR-011 specify the probe's NEW invariant rows concretely (same-anchor-for-sub-steps, --at uniformity, wording-class rule) rather than by intent only? [Clarity, FR-011]
- [x] CHK022 - Is SC-006's "zero writes outside the fixture tree" tied to a specified observation mechanism (write-snapshot/assertion seam) at requirement level? [Measurability, SC-006, FR-010]
- [x] CHK023 - Is every FR (FR-001 … FR-013) traceable to at least one acceptance scenario or success criterion, and vice versa? [Traceability]
- [x] CHK024 - Are the seeded config's content requirements specified (verbatim copy of the plugin template? provenance header? operator-edit invitation?) so "seeded" is verifiable? [Clarity, Gap, FR-004]
- [x] CHK025 - Does the `--at` contract's inclusion of read-only `backlog list` (contracts/cli-at-flag.md) conflict with FR-006's "every state-writing backlog verb" scope — which is normative? [Conflict, FR-006, contracts/cli-at-flag.md]
- [x] CHK026 - Are the retired behaviors (toplevel context consultation, slush non-fatal skip, nested-marker nearest-first resolution) each stated as testable negative requirements (MUST NOT), not only as narrative? [Completeness, FR-008, FR-002, FR-013]
- [x] CHK027 - Is the constitution amendment (1.3.0 → 1.4.0) requirement captured in a governed artifact with its required content (domain definition, no-overlap, domain-complete config, nested-allowance deletion), so its omission would fail review? [Traceability, plan §Constitution Check]
- [x] CHK028 - Are the in-repo committed-store seam test's preconditions specified (no `STACKCTL_BACKLOG_DIR`, store inside the payload frame) so the test cannot silently regress to the tmpdir shape it exists to replace? [Measurability, FR-003, US1 scenario 5]

## Notes

- Items CHK005, CHK014, CHK024, CHK025 look like genuine spec defects (one conflict between FR-013's blanket read prohibition and govern's code-under-audit reads; missing exit-code requirements; unspecified seed content; a state-writing-vs-list scope mismatch between spec and contract). RESOLVED 2026-06-12 in the same session (FR-013 scoped to stack-control-owned state + exit semantics added; FR-004 seed content specified; FR-006 widened to the dispatcher incl. list + nonexistent-dir refusal; FR-001 enumeration extended to scope-discovery registries).
- Remaining items evaluated 2026-06-12 against the post-fix spec + contracts: all pass (CHK001/003/004 via Key Entities + FR-013 + Edge Cases; CHK006/007 via the env-pierce edge case + Assumptions + cli-at-flag contract; CHK011/013/016/017 via the resolver-error-wording contract; CHK019 via the SC-004 normalization clause added this session; CHK020 via the anchor-resolution contract consumer enumeration; CHK021 via FR-011; CHK022 via FR-010 + the data-model fixture self-guard; CHK023/026/027/028 via FR/SC cross-references, MUST-NOT phrasings, plan Constitution Check, and US1 scenario 5).
- Checklist items test the WRITTEN requirements; none assert implementation behavior.
