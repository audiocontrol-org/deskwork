# Feature Specification: Audit protocol friction burndown

**Codename**: `multi/audit-protocol-friction-burndown`

**Feature Branch**: `feature/stack-control` (session-pinned; not a per-spec branch)

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Focus on the audit protocol friction. Of particular interest are: mechanical teeth for the per-phase audit requirement so adopting agents cannot skip it; right-sizing discrete phase boundaries so payloads fit non-frontier models; autonomous negotiation of the audit fleet so the operator does not have to orchestrate fleet configuration and the orchestrator does not have to pollute execution and remediation context with fleet configuration dance."

## Context

This spec graduates the current audit-protocol backlog cluster into one feature-rigor body. The seed is **TASK-60**. Direct sibling inputs include **TASK-70**, **TASK-71**, **TASK-73**, **TASK-74**, **TASK-75**, **TASK-76**, plus the still-open payload / anchor / reporting items **TASK-40**, **TASK-41**, **TASK-47**, **TASK-53**, **TASK-54**, **TASK-55**, **TASK-56**, and **TASK-58**.

The core problem is not "make barrage more configurable." It is that the current protocol still has too much operator-trust debt:

- a phase audit can be skipped by the adopting agent with no mechanical consequence
- the candidate phase boundaries are not sized against real lane capacity
- the actual implemented payload can exceed what the configured fleet can process well
- the operator still has to hand-orchestrate fleet selection and payload/lane fit
- payload and anchor defects can make govern audit the wrong thing while still looking successful

The backlog is the system of record, but this work now crosses govern, payload assembly, tasks-phase parsing, fleet capability modeling, and front-door execution ergonomics, so it needs one coherent spec.

## Clarifications

### Session 2026-06-13

- Q: What is the required audit unit?
  A: **Per-phase** is the required default unit for implementation governance. Whole-feature governance remains as a composing safety net, but it cannot substitute for skipped required phase checkpoints.
- Q: How should phase sizing work?
  A: There are **three distinct edges**:
  1. **Prospective sizing** before execution, which is necessarily a heuristic guess.
  2. **Actual sizing** after the candidate boundary is implemented, measured against the configured / negotiated auditor lanes and the real rendered payload.
  3. **Front-loaded lane capability knowledge**, so sizing is grounded in known-good models and practical payload envelopes rather than operator folklore.
- Q: What should happen when a phase is too large for the available lanes?
  A: The protocol must **fail loud with a mechanical disposition**. It must not silently run a bad oversized audit, and it must not rely on the operator to manually discover the right split.
- Q: Should fleet negotiation live in the remediation payload?
  A: No. Fleet selection / capability negotiation is **control-plane work** that must be decided before remediation context is assembled.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Per-phase governance has mechanical teeth (Priority: P1) 🎯 MVP

An adopting agent executes a multi-phase spec. For every phase that is marked complete enough to govern, the protocol mechanically requires a passing phase audit checkpoint before that phase can be treated as governed-clean or before later phases can be accepted as a substitute.

**Why this priority**: This is the trust boundary. Without teeth, "per-phase audit" is advisory prose that can be skipped under schedule pressure or tool drift.

**Independent Test**: Attempt to run whole-feature govern or phase advancement with one required phase lacking a recorded passing checkpoint; the command must fail loud and name the missing checkpoint.

**Acceptance Scenarios**:

1. **Given** a tasks file with multiple phases, **When** implementation proceeds past a phase that requires governance, **Then** the system refuses to treat that phase as accepted unless a passing phase checkpoint exists for that phase.
2. **Given** a phase checkpoint exists but is stale because the phase files changed afterward, **When** the next govern decision is made, **Then** the checkpoint is invalidated and the phase must be re-audited.
3. **Given** all required phase checkpoints are present and current, **When** whole-feature govern runs, **Then** it composes from those checkpoints instead of pretending they never mattered.

---

### User Story 2 - Phase boundaries are right-sized before and after implementation (Priority: P1)

Before implementation begins, the protocol proposes phase boundaries likely to fit the fleet. After the candidate phase is implemented, the protocol measures the real rendered audit payload and either accepts the boundary or mechanically demands a split / re-shape before governance continues.

**Why this priority**: Smaller audit units only help if they actually fit the lanes. This is the main leverage on payload size, latency, convergence cost, and smaller-model viability.

**Independent Test**: Create a candidate phase whose prospective estimate appears safe, then implement it so the actual rendered payload exceeds the negotiated lane envelope; the protocol must reject the boundary and demand a smaller unit.

**Acceptance Scenarios**:

1. **Given** a draft or existing tasks file, **When** the protocol evaluates candidate phase boundaries prospectively, **Then** it records the estimated payload basis and the recommended boundary decision.
2. **Given** an implemented phase, **When** the protocol renders the actual audit payload, **Then** it compares the real payload to the active lane envelopes rather than trusting the prior estimate.
3. **Given** a phase exceeds the permitted envelope for the active fleet, **When** govern is requested, **Then** the command fails loud with a boundary-too-large disposition and guidance to split or re-scope the phase.

---

### User Story 3 - Fleet capability knowledge and negotiation are autonomous (Priority: P1)

Before execution or remediation context is assembled, the control plane selects an audit fleet using a known-good capability set and payload envelopes, or determines that no acceptable fleet is available. The operator does not manually choreograph the lane dance for ordinary governance.

**Why this priority**: Today the operator and orchestrator have to carry model-selection state in their heads and in prompts. That pollutes execution context with control-plane concerns.

**Independent Test**: Run govern in an environment where one configured lane is unavailable and another is available but undersized for the payload; the negotiation step must select a viable fleet if one exists, or fail before remediation payload assembly if none exists.

**Acceptance Scenarios**:

1. **Given** a configured set of candidate lanes and capability metadata, **When** govern starts, **Then** it resolves the active fleet before assembling remediation prompts.
2. **Given** no lane set can satisfy the required floor and payload envelope, **When** govern starts, **Then** it exits with an explicit negotiation failure instead of running a degraded audit silently.
3. **Given** a lane is repeatedly known-good for a payload range, **When** future prospective sizing runs, **Then** that knowledge is reusable without manual operator restatement.

---

### User Story 4 - Per-phase govern scopes the real intended work (Priority: P2)

When a phase checkpoint runs, the payload is scoped from authoritative work boundaries rather than brittle prose parsing or incidental diff shape, and every path resolution step uses one installation anchor.

**Why this priority**: Mechanical teeth are useless if the payload is wrong. This story absorbs the currently open scoping and anchor debt that directly undermines trustworthy phase governance.

**Independent Test**: Run per-phase govern on a nested installation with a phase whose file list is not trivially derivable from colon-form headings; the payload must still resolve the intended files and the backlog/slush lanes must use the same installation root.

**Acceptance Scenarios**:

1. **Given** a phase header variant or richer phase metadata, **When** the phase selector resolves the audit scope, **Then** it derives the same scope regardless of superficial heading punctuation.
2. **Given** a nested installation, **When** govern, slush, and backlog interactions run in the same phase audit, **Then** they use one authoritative installation anchor.
3. **Given** a rename or tree move inside the phase, **When** the payload is assembled, **Then** the moved files remain in scope instead of being dropped or widened to the wrong tree.

---

### User Story 5 - Fleet degradation and payload problems are reported honestly (Priority: P2)

If the active fleet is undersized, a lane emits no output, or the payload is too large or malformed, the operator sees the real protocol state immediately, not success-shaped text followed by confusing downstream behavior.

**Why this priority**: Honest failure reporting is necessary for unattended execution and operator trust.

**Independent Test**: Force a zero-output lane, a floor shortfall, and a phase-too-large rejection in separate runs; each must produce a distinct, machine-checkable terminal outcome.

**Acceptance Scenarios**:

1. **Given** a lane emits zero output, **When** the run completes, **Then** the result records degraded coverage explicitly and names the impact on cross-model agreement.
2. **Given** the effective fleet floor is not met, **When** govern evaluates the run, **Then** the terminal state is a floor / negotiation failure rather than an ambiguous warning.
3. **Given** the phase boundary is too large, **When** the boundary gate fires, **Then** the terminal state identifies boundary sizing as the cause, not a generic barrage failure.

### Edge Cases

- A spec has only one meaningful phase. The protocol still requires a phase checkpoint, but prospective sizing may conclude that the only safe unit is the whole feature; this is valid only when recorded explicitly.
- A phase touches many small files whose combined rendered payload exceeds the envelope even though raw diff bytes appear small.
- A lane is technically available but known-bad for a payload class; negotiation must exclude it without the operator manually remembering that fact.
- A previously governed phase is later modified by cross-cutting work from a later phase; its checkpoint must become stale automatically.
- The configured fleet can audit the phase only if a stricter phase split is used; the protocol must prefer re-shaping the boundary over silently dropping lanes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST make required per-phase implementation governance mechanically enforceable. A phase that requires governance MUST have a current recorded passing checkpoint before it can be treated as accepted by later workflow steps.
- **FR-002**: The system MUST detect when a phase checkpoint is stale because in-scope files changed after that checkpoint, and MUST require re-governance for that phase.
- **FR-003**: The system MUST preserve whole-feature governance as a composing safety net, but whole-feature success MUST NOT erase or substitute for missing required phase checkpoints.
- **FR-004**: The system MUST support **prospective phase-boundary sizing** before execution using a declared estimation basis, and MUST record the basis used for each recommendation.
- **FR-005**: The system MUST support **actual phase-boundary sizing** after implementation using the real rendered audit payload and the active fleet's practical payload envelopes.
- **FR-006**: When a phase exceeds the active fleet envelope, the system MUST fail loud with a boundary-sizing disposition and MUST NOT silently run the oversized audit.
- **FR-007**: The system MUST maintain a reusable lane-capability knowledge surface that records known-good audit lanes, their constraints, and their practical payload envelopes.
- **FR-008**: Fleet negotiation MUST occur before remediation / execution context assembly, using the lane-capability knowledge plus current availability, and MUST either choose an acceptable fleet or fail explicit negotiation.
- **FR-009**: The system MUST scope per-phase govern from authoritative work boundaries rather than relying solely on brittle heading punctuation or incidental prose patterns.
- **FR-010**: Every govern sub-step participating in one phase audit run MUST resolve through one authoritative installation anchor.
- **FR-011**: The payload assembly logic MUST retain intended scope across renames / tree moves within the audited unit.
- **FR-012**: Fleet degradation, floor shortfall, negotiation failure, and boundary-too-large outcomes MUST each produce distinct explicit terminal reporting.
- **FR-013**: Audit artifacts and control-plane negotiation details MUST NOT pollute the remediation payload beyond the minimal facts needed to explain the selected or rejected fleet.

### Key Entities

- **Phase Governance Checkpoint**: Durable record that a specific phase, at a specific work state, passed govern. Carries phase identity, scope fingerprint, result, and freshness basis.
- **Prospective Boundary Estimate**: Pre-execution guess about a candidate phase's likely payload size and lane fit, including the heuristic inputs used to make the estimate.
- **Actual Payload Measurement**: Post-implementation record of the rendered audit payload for a phase and its fit or misfit against the active fleet envelope.
- **Lane Capability Profile**: System-of-record entry for one auditor lane's availability class, known-good operating range, failure modes, and practical payload envelope.
- **Fleet Negotiation Result**: Pre-remediation decision artifact naming the accepted fleet or the reason no viable fleet exists.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A required phase cannot be skipped silently: in validation tests, every attempt to advance or accept work without a current required phase checkpoint fails explicit gating.
- **SC-002**: In fixture-based tests, a prospective-safe but actually-oversized phase is rejected by the actual payload gate 100% of the time.
- **SC-003**: Fleet selection happens before remediation payload assembly in every govern path covered by automated tests, and no test requires manual operator lane choreography to achieve the default audited path.
- **SC-004**: Per-phase govern fixture tests for nested installations, non-colon phase headers, and rename-heavy diffs resolve the intended scope without widening to unrelated files.
- **SC-005**: Distinct degraded terminal states remain machine-distinguishable in tests: at minimum `floor-shortfall`, `negotiation-failed`, `boundary-too-large`, and `coverage-degraded`.

## Assumptions

- The backlog remains the system of record for intake and status; this spec only governs the execution path for the promoted audit-protocol work.
- Existing tasks.md phases remain the primary human-authored boundary surface; any richer authoritative phase metadata can layer on top of that rather than replacing tasks.md outright.
- Known-good lane capability data can begin with static recorded knowledge and later become self-calibrating without changing the external contract.
- The current govern / barrage architecture remains in `plugins/stack-control`; this feature hardens and extends it rather than replacing it wholesale.
