# Feature Specification: deskwork governance as a Spec Kit `after_implement` extension (first vertical slice)

**Feature Branch**: `feature/pluggable-lifecycle-providers`

**Created**: 2026-06-04

**Status**: Draft (reshaped to Model 3 after clarify — see Clarifications)

**Input**: First slice of the pluggable-lifecycle-providers north star. Prove deskwork's differentiated governance back half runs automatically inside Spec Kit's native flow, on a plan Spec Kit authored and executed.

> **North star** (see `../../docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/prd.md` § North Star): deskwork as the provider-agnostic control plane that **governs** *and* **executes (parallel, multi-CLI, worktree-isolated)** any provider's dependency-annotated plan. This slice delivers the **governance half on a foreign plan**; the parallel multi-CLI executor is the captured next slice, explicitly out of scope here.

## Clarifications

### Session 2026-06-04

- Q: Should deskwork's `implement` walk the provider's tasks? → A: No. Spec Kit's native `/speckit-implement` executes; deskwork governs separately (Model 3). `implement` is commodity; governance is the differentiator (`design.md` §1).
- Q: Does Spec Kit support hooks on implement? → A: Yes, at command boundaries (`after_implement`), via the extension system; whole-run granularity, not per-task. Operator: granularity is acceptable.
- Q: Where does governance attach? → A: As a Spec Kit **extension** registering a command on the `after_implement` hook, firing automatically post-implement.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Governance fires automatically after Spec Kit implements (Priority: P1)

A maintainer runs Spec Kit's native `/speckit-implement` to build a feature. When it completes, deskwork's governance — cross-model audit-barrage plus the finding lifecycle — runs automatically over the resulting work, with no separate manual invocation and with no awareness on deskwork's part of which tool authored or executed the plan.

**Why this priority**: This is the governance half of the north star in miniature, and the smallest faithful proof that deskwork's differentiator composes with a provider's native flow rather than replacing it.

**Independent Test**: Install the governance extension, run `/speckit-implement` on a feature, and observe deskwork's audit-barrage fire as the `after_implement` step and produce findings — without any manual barrage invocation.

**Acceptance Scenarios**:

1. **Given** the governance extension is installed and registered on `after_implement`, **When** `/speckit-implement` completes, **Then** deskwork's audit-barrage runs automatically and writes a findings artifact referencing the implemented work.
2. **Given** the audit-barrage runs, **When** it dispatches model lanes, **Then** it spawns multiple LLM CLIs (e.g. claude + codex) — preserving deskwork's cross-model fan-out inside Spec Kit's flow.
3. **Given** findings are produced, **When** they are recorded, **Then** they land in deskwork's finding store (the feature `audit-log.md`) with `Status: open`, referencing the Spec-Kit-authored feature.

### User Story 2 - Learn the extension seam (Priority: P2)

The maintainer wants the slice to reveal exactly what an `after_implement` governance command needs from Spec Kit (which context — the diff, the plan, the feature directory) and how command-name resolution works (Spec Kit's dot→hyphen slash-command mapping vs deskwork's colon-namespaced verbs), so the durable bridge can be designed from evidence.

**Why this priority**: The seam learnings are the research deliverable that de-risks the larger bridge and the eventual parallel-executor slice.

**Independent Test**: After the slice runs, a written record exists of (a) the context the governance command consumed and (b) how its command name was resolved/registered for the Claude integration.

**Acceptance Scenarios**:

1. **Given** the governance command ran as a hook, **When** the seam is reviewed, **Then** the context it received from Spec Kit (diff/plan/feature-dir) is recorded.
2. **Given** the extension is registered, **When** the registration is reviewed, **Then** how the command name resolves for the `claude` integration is documented (resolving the TF-05/TF-06 naming seam).

### Edge Cases

- What happens when `/speckit-implement` produces no diff (no-op run)? (Governance runs against the plan with an empty diff; barrage either is skipped or runs and reports no defects — never errors.)
- What happens when `/speckit-implement` partially fails? (Governance still fires on whatever landed; findings reflect the partial state; the hook does not mask the implement failure.)
- What happens on the very first run, before the governance extension exists? (Bootstrapping: the extension must be built and registered first; the demonstration is the *next* implement after the extension exists — self-hosting.)
- How is deskwork's colon-namespaced governance verb invoked from Spec Kit's hook, given Spec Kit constructs slash-commands by replacing dots with hyphens? (The seam US2 must resolve.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: deskwork's governance (audit-barrage + lifting findings into the feature `audit-log.md`) MUST be packaged as a Spec Kit extension that exposes an invokable command.
- **FR-002**: The extension MUST register its governance command on the `after_implement` hook so it fires automatically when `/speckit-implement` completes.
- **FR-003**: The governance command MUST run over the implemented work (the resulting diff) and the plan, and MUST contain zero branches on which tool authored or executed the plan.
- **FR-004**: The audit-barrage invoked by the governance command MUST fan out across multiple LLM CLIs (at least two model lanes), preserving deskwork's existing cross-model primitive.
- **FR-005**: Findings MUST be recorded in deskwork's finding store (`audit-log.md`) with stable IDs and `Status: open`, referencing the Spec-Kit feature.
- **FR-006**: Whole-run hook granularity (governance fires once per implement run, not per task) is ACCEPTED for this slice; the granularity MUST be recorded as a known property, not silently assumed.
- **FR-007**: The slice MUST record the extension-seam learnings: the context the governance command consumed from Spec Kit, and how its command name was registered/resolved for the `claude` integration.
- **FR-008**: This slice MUST NOT include the parallel, multi-CLI, worktree-isolated execution engine (the north star); that is the captured next slice. The governance pass here is observational, not an executor.

### Key Entities *(include if data involved)*

- **Governance extension**: a Spec Kit extension (`extension.yml` with `provides.commands` + a `hooks.after_implement` entry) packaging deskwork's governance command.
- **Governance command**: the invokable unit run on `after_implement`; consumes the diff/plan, invokes audit-barrage, lifts findings.
- **Findings artifact**: cross-model audit-barrage output lifted into the feature `audit-log.md`.
- **Seam record**: the documented context-consumed + command-name-resolution learnings (research deliverable).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After `/speckit-implement` completes on a feature with the extension installed, deskwork's audit-barrage runs with zero manual invocation (the hook fires it).
- **SC-002**: The governance pass produces findings in at least one model lane referencing the implemented work, recorded in `audit-log.md`.
- **SC-003**: The governance command's exercised code path contains zero string matches on an authoring/execution tool's name (capability-/diff-driven, not provider-named).
- **SC-004**: The audit-barrage spawns at least two distinct LLM CLIs (cross-model fan-out preserved inside Spec Kit's native flow).
- **SC-005**: A written seam record exists (context consumed + command-name resolution), sufficient to design the durable bridge and inform the parallel-executor slice.

## Assumptions

- Spec Kit's native `/speckit-implement` is the executor; deskwork does not run an execution loop in this slice.
- deskwork already provides audit-barrage (multi-CLI fan-out) and a finding store (`audit-log.md`); this slice wires them into Spec Kit's `after_implement`, it does not build them.
- Whole-run governance granularity is acceptable (operator-confirmed); per-task governance is not a requirement of this slice.
- Branch/worktree ownership stays with deskwork; Spec Kit branch hooks remain pinned to the deskwork feature branch (TF-05).
- Out of scope (captured as the north-star next slice): the parallel, multi-CLI, worktree-isolated execution engine; the normalized lifecycle-manifest; `reconcile()`/re-sync; the full provider port; the tracker capability.
