# Feature Specification: deskwork back-half on a Spec-Kit-authored plan (first vertical slice)

**Feature Branch**: `feature/pluggable-lifecycle-providers`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "First vertical slice of the pluggable-lifecycle-providers bridge: prove deskwork's differentiated back half can run against a Spec-Kit-authored plan, end to end."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the differentiator on a plan it did not author (Priority: P1)

A maintainer of the deskwork (`dw-lifecycle`) tool wants its governance back half — the cross-model audit-barrage and the finding lifecycle — to operate on a feature plan that was authored by an external tool (GitHub Spec Kit), not by deskwork's own planning flow. They have a Spec-Kit `tasks.md` for some feature; they want deskwork to walk those tasks and audit that plan as if deskwork had authored it, with no awareness on deskwork's part of which tool produced the plan.

**Why this priority**: This is the entire thesis of the feature in miniature. If the back half cannot consume a foreign plan end-to-end, nothing else in the larger feature matters. It is the smallest demonstration that authoring is separable from governance.

**Independent Test**: Take a real Spec-Kit `tasks.md`, run the projection, point deskwork's task-walking loop at the result, and run an audit-barrage against the projected plan. Success is observable without any other slice: the walk enumerates the provider's tasks in order and the barrage produces a findings file.

**Acceptance Scenarios**:

1. **Given** a Spec-Kit `tasks.md` containing N atomic tasks, **When** the projection runs, **Then** a normalized task list is produced containing exactly N tasks, in source order, each carrying a stable provider task identifier, a title, and a status.
2. **Given** the projected task list, **When** deskwork's task-walking loop reads it, **Then** the loop enumerates every task in order and reports the same count N.
3. **Given** the projected plan, **When** an audit-barrage is fired against it, **Then** the barrage runs to completion and writes a findings artifact referencing the plan under audit.

### User Story 2 - Learn the real normalized shape from the integration (Priority: P2)

The same maintainer wants the first slice to *reveal* what fields a normalized plan actually needs in order for the back half to function — so the durable schema can later be written from evidence rather than from speculation.

**Why this priority**: The slice's research value is as important as its demonstration value. Capturing exactly which fields the walk and the barrage read (and which fields the Spec-Kit artifact actually supplied) is the input to the real schema in a later slice.

**Independent Test**: After the slice runs, the set of normalized fields that were actually read by a consumer is enumerable and recorded; every field present in the projection is traceable to either a Spec-Kit source field or a documented default.

**Acceptance Scenarios**:

1. **Given** the projection has run, **When** the normalized fields are listed, **Then** each field is annotated as sourced-from-Spec-Kit or filled-by-default.
2. **Given** the slice is complete, **When** the maintainer reviews it, **Then** a written record exists of which normalized fields each consumer (the walk, the barrage) actually depended on.

### Edge Cases

- What happens when the Spec-Kit `tasks.md` contains tasks with no stable identifier? (The projection must still produce one normalized task per source task, with a deterministic synthesized identifier, and must flag that the identifier is synthesized.)
- What happens when the `tasks.md` is empty or contains zero tasks? (The projection produces an empty task list; the walk reports zero tasks; the barrage either is skipped or runs against an empty plan without error.)
- What happens when a Spec-Kit task spans multiple lines or carries Spec-Kit-specific annotations (e.g., parallel-eligibility markers)? (The projection must not drop the task; annotations it does not yet consume are either captured verbatim or explicitly recorded as dropped in the slice's findings.)
- What happens when the same task identifier appears twice in the source? (The projection must surface the collision rather than silently overwrite.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST read a Spec-Kit-authored `tasks.md` and produce a normalized task list without modifying the source artifact.
- **FR-002**: The normalized task list MUST be a flat, top-level collection (a task spine), with each task carrying at minimum a provider task identifier, a title, and a status.
- **FR-003**: The projection MUST preserve the source order of the provider's tasks and MUST emit exactly one normalized task per provider task (no re-decomposition, no merging).
- **FR-004**: When a provider task has no stable identifier, the system MUST synthesize a deterministic identifier and MUST mark it as synthesized so downstream consumers can treat it as fragile.
- **FR-005**: deskwork's existing task-walking behavior MUST be able to enumerate the normalized task list and report a task count equal to the number of provider tasks.
- **FR-006**: deskwork's existing audit-barrage MUST be able to run against the projected plan and produce a findings artifact, with no branch in the barrage on which tool authored the plan.
- **FR-007**: The system MUST record, for the completed slice, which normalized fields each consumer actually read and whether each field was sourced from Spec Kit or filled by a default — the evidence input to the durable schema.
- **FR-008**: The system MUST treat the projection produced in this slice as a throwaway spike — it is research output to be discarded and rebuilt test-first once the normalized shape is known, and MUST NOT be relied upon as the durable normalization implementation.

### Key Entities *(include if feature involves data)*

- **Provider plan (source artifact)**: the Spec-Kit `tasks.md`. Authoritative for *intent*. Never written to by deskwork. The fossil the projection reads.
- **Normalized task**: one atomic unit of work projected from a provider task. Attributes: provider task identifier (possibly synthesized + flagged), title, status. The seed of the future "lifecycle manifest" task spine.
- **Normalized task list (the spine)**: the flat, top-level, source-ordered collection of normalized tasks that deskwork's back half walks.
- **Findings artifact**: the output of the audit-barrage run against the projected plan; references the plan under audit.
- **Field-provenance record**: the per-field annotation (sourced-from-Spec-Kit vs filled-by-default) plus the per-consumer record of which fields were actually read — the slice's research deliverable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintainer can take an unmodified Spec-Kit `tasks.md`, run the projection, and the resulting task list contains exactly the same number of tasks as the source, in the same order — verified by count and ordering.
- **SC-002**: deskwork's task-walking loop, pointed at the projected list, enumerates 100% of the provider's tasks with zero tasks dropped or duplicated.
- **SC-003**: An audit-barrage fired against the projected plan completes and produces a findings artifact in at least one model lane — demonstrating the differentiator runs on a plan deskwork did not author.
- **SC-004**: The audit-barrage and task-walking code paths exercised in this slice contain zero references to the authoring tool's name (no string match on the provider's name in the consuming code paths).
- **SC-005**: At slice completion, a written field-provenance record exists enumerating every normalized field, its source (Spec-Kit or default), and which consumer read it — sufficient for a later slice to author the durable schema from this evidence.

## Assumptions

- The maintainer is the primary (and, in this slice, only) user; this is internal tooling, not an end-user-facing feature.
- Spec Kit is installed and can author a `tasks.md` for some feature; producing that artifact is a precondition, not part of this slice's projection work.
- deskwork already provides a task-walking loop and an audit-barrage capability; this slice feeds them a projected plan rather than building them.
- The projection is a throwaway spike (per FR-008); minimal robustness is acceptable so long as the edge cases above are observed (not silently mishandled).
- Branch and worktree ownership remain with deskwork; Spec Kit's branch-creation behavior is pinned to the existing deskwork feature branch (see the feature's `tooling-feedback.md` TF-05) and is out of scope for the projection itself.
- Out of scope for this slice (deferred to later slices): `reconcile()` / re-sync, the full provider port (`detect` / `capabilities` / `author`), the `native` adapter, the tracker capability, and the JSON-Schema validator.
