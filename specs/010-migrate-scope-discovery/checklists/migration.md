# Migration Requirements-Quality Checklist: Migrate scope-discovery into stack-control

**Purpose**: Unit-tests-for-English over the spec — validate that the migration's requirements are complete, clear, consistent, measurable, and edge-covered BEFORE `/speckit-tasks`. Tests the requirements, not the implementation.
**Created**: 2026-06-09
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md)
**Focus**: migration-fidelity · per-codebase boundary · isolation invariant · edge coverage · external-contract consistency

## Migration Scope & Delta Completeness

- [ ] CHK001 Is the set of components to migrate enumerated completely and unambiguously (clone detection, disposition lifecycle, discovery, agents, registries, dispatch wrapper, install/doctor)? [Completeness, Spec §"Surface to migrate", §US1-US6]
- [ ] CHK002 Are the ALREADY-migrated components (audit-barrage, partial promote-findings, partial util) explicitly named so the requirements can't drive re-migration? [Completeness, Conflict-avoidance, research §R3]
- [x] CHK003 Are the OUT-OF-SCOPE components (audit-orchestration loop: controller/orchestrator/mediation/escalation/recovery/llm + promote-findings remainder) explicitly excluded in the requirements, not just in research? [Coverage] — RESOLVED 2026-06-09: added "Migration boundary — explicitly out of scope" section to spec body.
- [ ] CHK004 Is "full surface, one delivery" stated as a requirement (not only a clarification note), so no downstream task can re-introduce phasing? [Clarity, Spec §Clarifications 2026-06-09]
- [ ] CHK005 Are the genuinely-future items (v2 agents, cross-language, studio surface) specified with a tracking obligation (roadmap/backlog), with the trigger for that tracking defined? [Completeness, Spec §"Captured for future expansion"]

## Per-Codebase Boundary (the novel requirement)

- [ ] CHK006 Is "a codebase" defined with a single, testable rule (nearest-enclosing 009 installation, excluding nested children)? [Clarity, Spec §Clarifications, §FR-007]
- [ ] CHK007 Is "per-codebase scoping is the DEFAULT" stated as a measurable requirement (reachable with no path argument)? [Measurability, Spec §FR-006]
- [ ] CHK008 Is the cross-codebase non-detection requirement objectively verifiable (e.g., vendored audit-barrage produces zero clone findings)? [Measurability, Spec §FR-008, §SC-002]
- [ ] CHK009 Are the nested-installation boundary semantics specified for the duplicate-spanning-parent/child case? [Edge Case, Spec §"Edge Cases" nested installations]
- [ ] CHK010 Is the failure behavior specified when boundary resolution reaches the repo/filesystem root with no installation config (fail-loud, no cwd fallback)? [Edge Case, Spec §FR-007, data-model §CodebaseBoundary]
- [ ] CHK011 Is the explicit-override path requirement consistent with the default-scoping requirement (override allowed, absence ⇒ codebase, never whole-repo)? [Consistency, Spec §FR-005 vs §FR-006]

## Isolation Invariant (dw-lifecycle untouched)

- [ ] CHK012 Is "dw-lifecycle untouched" specified as a measurable acceptance signal (its tests pass; baselines/config byte-unchanged)? [Measurability, Spec §SC-010, §FR-002]
- [ ] CHK013 Is the vendor/copy (not destructive-move) semantics stated as a requirement, not only an assumption? [Clarity, Spec §Clarifications, §FR-002]
- [ ] CHK014 Is the requirement that migrated verbs never read/write dw-lifecycle's scope-discovery files explicit? [Completeness, Spec §"Edge Cases" dw-lifecycle untouched, contracts §cross-cutting]

## Consistency With External Contracts

- [ ] CHK015 Are the config/registry-location requirements consistent with the 009 installation config contract (project-local default, no bundled-copy fallback)? [Consistency, Spec §FR-028]
- [ ] CHK016 Is the lazily-created-vs-pre-scaffolded decision for scope-discovery registries consistent with 009 FR-001/FR-016? [Consistency, research §R5]
- [ ] CHK017 Is the "drop hook-install machinery; enforcement in skill bodies + CLI verbs" requirement consistent with `.claude/rules/enforcement-lives-in-skills.md`? [Consistency, Spec §Clarifications, §FR-024..FR-026]
- [ ] CHK018 Is the CLI-as-vendor-neutral-core requirement (no Claude-Code surface required) consistent with 009 FR-025/FR-026? [Consistency, Spec §FR-034]
- [ ] CHK019 Is the TDD-first requirement for a *port* of existing code stated unambiguously (RED before the generalized port, no untested verbatim copy)? [Clarity, plan §Constitution Check I]

## Acceptance Criteria Quality

- [ ] CHK020 Are all Success Criteria technology-agnostic and objectively measurable (no implementation detail leaking into SC-001..SC-011)? [Measurability, Spec §Success Criteria]
- [ ] CHK021 Does every P1/P2/P3 user story have at least one acceptance scenario that maps to a Success Criterion? [Traceability, Spec §US1-US8 ↔ §SC]
- [ ] CHK022 Is the gutted-stub self-check requirement stated so it is objectively verifiable (harness FAILS against a gutted gate)? [Measurability, Spec §FR-026, §SC-007]
- [ ] CHK023 Is "config-activated agents no-op on empty registries" specified as a measurable zero-cost requirement? [Measurability, Spec §FR-019, §SC-008]

## Scenario & Edge-Case Coverage

- [ ] CHK024 Are malformed-baseline / malformed-registry requirements defined (fail-loud, name the file, never false-clean)? [Edge Case, Spec §FR-035, §"Edge Cases"]
- [ ] CHK025 Are requirements defined for the empty/absent-registry path distinct from the malformed path? [Coverage, Spec §"Edge Cases" empty vs malformed]
- [ ] CHK026 Are concurrent-installation requirements defined (a refresh/dispose in installation A produces zero changes to B)? [Coverage, Spec §"Edge Cases" concurrent installations, §SC-004]
- [ ] CHK027 Are the refactor-disposition preconditions (Step 0a canonical-side + Step 0b test-proof) specified completely enough to be refused when incomplete? [Completeness, Spec §FR-011, §SC-005]
- [ ] CHK028 Is the "no language match" requirement defined (empty-but-valid result, not an error) for a codebase with no matching files? [Edge Case, Spec §"Edge Cases" no language match]
- [ ] CHK029 Are governance implement-mode requirements defined such that "TODO placeholder removed" is verifiable? [Coverage, Spec §FR-032, §SC-011]

## Dependencies, Assumptions & Ambiguities

- [ ] CHK030 Are the new-dependency assumptions (jscpd; schema-validation lib; no ts-morph/ast-grep) documented and validated rather than presumed? [Assumption, research §R2]
- [ ] CHK031 Is the assumption that 009 is landed and is the config substrate stated and currently true? [Assumption, Spec §Assumptions, §Dependencies]
- [ ] CHK032 Is the deferred OQ-5 (install-drift advisory home) resolved without leaving an intended-but-unbuilt gap (built here per R6), consistent with the no-partial requirement? [Conflict-avoidance, research §R6, Spec §US8]
- [ ] CHK033 Is the `design:gap/project-relative-doc-discovery` subsumption ambiguity flagged for resolution before duplicating its config-resolution? [Ambiguity, Spec §Dependencies]
- [ ] CHK034 Is the per-component port-vs-rebuild recording requirement (FR-004) specified clearly enough that "which were rebuilt" is auditable after the fact? [Clarity, Spec §FR-004, §Clarifications]
