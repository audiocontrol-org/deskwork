# Feature Specification: Govern the spec, not just the implementation

**Codename**: `design/spec-governance`

**Feature Branch**: `feature/pluggable-lifecycle-providers` (built on the shared program branch; not a per-feature branch)

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Govern the spec, not just the implementation — a stack-control capability that fires the cross-model audit-barrage over a SPEC at definition time, mirroring the existing deskwork-governance after_implement extension that fires the barrage over produced code."

## Why this feature exists (thesis grounding)

stack-control's organizing thesis is **invest heavily in up-front design and tooling; industrialize execution**. The design phase is the higher-leverage place to catch defects — a defect caught in the spec is orders of magnitude cheaper than the same defect caught after implementation. stack-control already fires a cross-model audit-barrage automatically *after implementation* (the founding `impl/governance` extension, `deskwork-governance`'s `after_implement` hook). This feature is the design-phase analog: extend governance **left**, to the spec itself.

The motivating evidence is concrete: a manual cross-model barrage run over the `impl/execution-engine` spec (`specs/002`, claude + codex) surfaced 51 findings — including **3 real contradictions the author had introduced** plus deep design gaps a single authoring pass missed. Spec quality must not depend on a human remembering to run the barrage. This is **detection over instruction**: make the failure state (an ungoverned, self-contradictory spec graduating to planning) mechanically surfaced rather than relying on discipline.

## Clarifications

### Session 2026-06-06

- Q: FR-010 — should a spec-governance finding BLOCK progression, or be advisory? → A: **Blocking via the ported dw-lifecycle audit protocol.** The gate is satisfied when **either** one barrage iteration yields **0 HIGH and 0 MEDIUM** findings, **or** **two consecutive iterations** each yield **0 HIGH** findings. This makes spec-governance an **iterative convergence loop** (barrage → fix → re-barrage). **Port the audit protocol — the convergence criterion + finding state machine — from `dw-lifecycle`, not just the barrage primitive.**
- Q: FR-011 — which definition-time checkpoint fires the spec-barrage? → A: **`after_clarify`** (the spec is decision-complete then; where the motivating `specs/002` barrage ran), **configurable to also fire `after_plan`**. `after_specify` is intentionally not the default (the spec may still carry intentional unresolved-clarification placeholders there).
- Q: FR-012 — how is spec-governance delivered? → A: **A Spec Kit governance extension with hooks**, mirroring the founding `deskwork-governance` `after_implement` extension, so it fires **universally** (front-door skills *or* raw `/speckit-*`). NOT folded into the front-door skills only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Spec is automatically governed at definition time (Priority: P1) 🎯 MVP

A maintainer authors or revises a spec through the stack-control front door. When the spec reaches a defined definition-time checkpoint, the cross-model audit-barrage fires **automatically** — multiple model families review the spec in parallel — and surfaces findings, with no manual barrage invocation required. The maintainer sees the findings without having had to remember to ask for them.

**Why this priority**: This is the core capability and the whole point of the feature — automatic, mechanical spec governance. Without it, spec governance remains a discipline a human can forget. It delivers value on its own: even with the simplest possible finding presentation and no blocking gate, automatic surfacing is strictly better than the status quo (manual-and-forgettable).

**Independent Test**: Author a spec containing a deliberate self-contradiction, drive it to the defined checkpoint, and observe that a barrage run is recorded and the contradiction is surfaced as a finding — without any manual barrage command being issued.

**Acceptance Scenarios**:

1. **Given** a spec at the defined definition-time checkpoint, **When** the checkpoint is reached, **Then** a cross-model barrage run is initiated automatically and its findings are surfaced to the maintainer.
2. **Given** a spec with no detectable issues, **When** the barrage runs, **Then** a run is still recorded (an empty/clean result is a recorded outcome, not a skipped step).
3. **Given** the barrage has run, **When** the maintainer inspects the result, **Then** each finding is attributed to the model family that produced it.

---

### User Story 2 - Cross-model agreement is flagged as the high-confidence signal, findings routed to triage (Priority: P2)

When two or more independent model families flag the same root cause, that agreement is the strongest signal that the finding is real. The maintainer can see which findings have cross-model agreement (HIGH confidence) versus single-model findings, and route all findings into a triage workflow where each gets an explicit disposition.

**Why this priority**: Genetic diversity in failure modes is the reason to run *multiple* models rather than one; surfacing the agreement signal is what turns a pile of findings into a prioritized worklist. Builds directly on US1.

**Independent Test**: Run the barrage over a spec with a contradiction obvious enough that two model families both flag it; confirm the finding is labeled HIGH-confidence (cross-model agreement) and is distinguishable from single-model findings, and that each finding can be given a disposition.

**Acceptance Scenarios**:

1. **Given** a barrage result where ≥2 model families flagged the same root cause, **When** findings are presented, **Then** that finding is labeled HIGH-confidence / cross-model agreement.
2. **Given** a set of findings, **When** the maintainer triages them, **Then** each finding receives an explicit disposition that is recorded durably.
3. **Given** a previously-dispositioned finding, **When** the barrage re-runs on a later revision, **Then** the result distinguishes still-open findings from already-dispositioned ones (no loss of disposition state).

---

### User Story 3 - Governance fails loud when the audit capability is absent (Priority: P3)

Spec governance composes the existing audit-barrage capability in-house. If that capability is unavailable (no model families installed/reachable, or the barrage primitives are missing), the define flow MUST fail loud with an actionable message — it MUST NOT silently skip governance and let an ungoverned spec proceed as if governed.

**Why this priority**: A silently-skipped governance step is worse than no feature at all — it gives false assurance. This is the no-fallbacks principle applied to governance. Lower priority only because it is a guardrail on US1/US2, not the primary value.

**Independent Test**: Simulate an environment with no available audit capability, drive a spec to the checkpoint, and confirm the flow fails loud with an actionable message rather than reporting success or silently continuing.

**Acceptance Scenarios**:

1. **Given** no audit capability is available, **When** the checkpoint is reached, **Then** the flow fails loud with an actionable message and does NOT report the spec as governed.
2. **Given** some but not all model families are available, **When** the barrage runs, **Then** it proceeds with the available families AND records reduced coverage (degraded, but honest — never silently presented as full coverage).

---

### Edge Cases

- **No model families available**: fail loud (US3) — never silent skip.
- **One model family available**: the barrage runs but cannot produce cross-model agreement; coverage is recorded as reduced, and no finding can be labeled HIGH-confidence by agreement (single-model findings still surface).
- **A model family times out or errors mid-run**: the run records partial coverage with the failure noted; it does not abort the whole barrage if at least one family succeeded.
- **Spec re-revised after triage**: dispositions from the prior run are preserved; the new run re-surfaces still-open findings and any new ones (empty revisions beat missed changes — a re-run is never pre-emptively skipped as a no-op).
- **Barrage latency vs. the unattended directive**: the barrage can be slow and the gate is iterative (FR-010/FR-014); the convergence loop must run unattended (fix-and-re-barrage without operator presence) and remain bounded (FR-014) so a non-converging spec escalates rather than runs forever.
- **Governance never converges**: findings keep surfacing across iterations — the loop hits the configured iteration ceiling and records a non-converged terminal state / escalates to the operator (FR-014); it does not block indefinitely or loop unbounded.
- **Findings on a spec that is later abandoned/cancelled**: findings are recorded against the spec and persist with it (records preserve history; they are not deleted because the spec was abandoned).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST fire a cross-model audit-barrage over a spec **automatically** at a defined definition-time checkpoint, with no manual barrage invocation required.
- **FR-002**: The barrage MUST run **multiple model families in parallel** (for genetic diversity in failure modes), reusing the SAME barrage mechanism (render + fire + triage) as the implementation-phase governance rather than a parallel, separately-maintained implementation.
- **FR-003**: The system MUST flag **cross-model agreement** (two or more model families flagging the same root cause) as the HIGH-confidence signal, distinguishable from single-model findings.
- **FR-004**: The system MUST surface findings attributed per model family and route them into a triage workflow in which each finding receives an explicit, durably-recorded disposition.
- **FR-005**: The system MUST **fail loud when no audit capability is available** — it MUST NOT silently skip governance or report an ungoverned spec as governed (no-fallbacks principle).
- **FR-006**: The system MUST **compose, in-house, both the existing audit-barrage capability AND the `dw-lifecycle` audit protocol** — the audit protocol being the iterative convergence criterion (FR-010) plus the finding state machine / triage discipline, not just the one-shot barrage primitive. Both currently live in `dw-lifecycle` and their migration (`multi/migrate-audit-barrage`) is sequenced after this feature; until then this feature depends on both in-house and MUST fail loud if either is absent. (No "no coupling" claim — the coupling is real and acknowledged, mirroring the `impl/execution-engine` spec's FR-022. The migration `multi/migrate-audit-barrage` therefore carries the protocol, not only the barrage — operator clarification 2026-06-06.)
- **FR-007**: Findings MUST be recorded in a durable findings home with disposition state (e.g. open → fixed / acknowledged) that **survives across spec revisions**, so a later run can distinguish still-open findings from already-dispositioned ones.
- **FR-008**: When some but not all model families are available, the barrage MUST proceed with the available families AND **record reduced coverage** — degraded coverage must never be presented as full coverage.
- **FR-009**: A barrage run MUST be recorded even when it produces zero findings (a clean result is an outcome, not a skipped step), and a re-run MUST NOT be pre-emptively skipped as a presumed no-op (empty revisions beat missed changes).
- **FR-010** *(promotion gate — audit-protocol convergence)*: Spec-governance MUST gate progression to the next Spec Kit step on the **ported `dw-lifecycle` audit-protocol convergence criterion**: the gate is satisfied when **either** a single barrage iteration produces **0 HIGH and 0 MEDIUM** findings, **or** **two consecutive iterations** each produce **0 HIGH** findings. Until the criterion is met the spec MUST NOT graduate — a machine-checkable gate mirroring `impl/execution-engine` FR-030; an explicit override (if used) MUST be recorded. This makes spec-governance an **iterative loop**: barrage → triage/fix the spec → re-barrage → … until convergence.
- **FR-011** *(hook point)*: The spec-barrage MUST fire at **`after_clarify`** (the spec is decision-complete then) and MUST be **configurable to also fire at `after_plan`**. `after_specify` is intentionally NOT the default — a spec at that point may still carry intentional unresolved-clarification placeholders, which would generate noise.
- **FR-012** *(delivery mechanism)*: Spec-governance MUST be delivered as a **Spec Kit governance extension with hooks**, mirroring the founding `deskwork-governance` `after_implement` extension, so it fires **universally** — whether the operator drives the front-door `define`/`extend` skills or raw `/speckit-*` commands. It MUST NOT be folded into the front-door skills only.
- **FR-013**: The spec-barrage operates on the **spec** by default; when the `after_plan` checkpoint is enabled (FR-011), it also covers the **plan**. No other artifacts are in scope.
- **FR-014** *(iterative convergence + bounded termination)*: The system MUST support repeated barrage iterations over a spec, tracking finding state across iterations (FR-007), until the FR-010 convergence criterion is met or an override is recorded. Each iteration MUST be a recorded run (FR-009). The loop MUST be **bounded** — if convergence is not reached after a configured iteration ceiling, the system MUST surface **non-convergence** (escalate to the operator / record a non-converged terminal state) rather than loop forever. This keeps the loop safe under the unattended/all-night directive.

### Key Entities *(include if feature involves data)*

- **Spec-barrage run**: one automatic invocation of the cross-model barrage over a spec at a checkpoint; carries the model families exercised, coverage (full/reduced), timestamp, and the produced findings. Recorded durably.
- **Finding**: a single issue raised by the barrage; carries the originating model family (or families, when agreement), a confidence label (HIGH when cross-model agreement), a severity, the cited spec location, and a disposition (open / fixed / acknowledged).
- **Checkpoint (hook point)**: the definition-time moment at which the barrage fires (one or more of `after_specify` / `after_clarify` / `after_plan`).
- **Audit capability**: the in-house-composed barrage primitives + the available model families. Its presence/absence drives the fail-loud behavior (FR-005) and coverage recording (FR-008).
- **Audit protocol**: the ported `dw-lifecycle` convergence discipline — the iteration loop, the convergence criterion (0 HIGH + 0 MED in one iteration, or 0 HIGH across two consecutive), the finding state machine, and the bounded-iteration ceiling. Distinct from the barrage primitive (which produces findings in one pass); the protocol governs how many passes run and when the gate opens.
- **Governance run (iteration set)**: the sequence of barrage iterations for one spec graduation attempt; carries each iteration's run, the convergence outcome (converged / overridden / non-converged), and the iteration count vs. ceiling.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A spec that reaches the defined checkpoint has a barrage run recorded **with zero manual barrage invocations** — automatic governance is observable in the run record.
- **SC-002**: When ≥2 model families flag the same root cause, that finding is labeled HIGH-confidence (cross-model agreement) and is distinguishable from single-model findings in the output.
- **SC-003**: When no audit capability is available, the flow fails loud with an actionable message and the spec is NOT recorded as governed — **zero silent skips** across all runs.
- **SC-004**: Across a spec revised at least twice, findings persist with their dispositions — a re-run correctly distinguishes still-open findings from already-dispositioned ones (no disposition loss).
- **SC-005**: Spec-phase findings and implementation-phase findings appear in the **same format and triage workflow**, so an operator triages both identically (one governance surface, two phases — no divergent second toolchain to learn).
- **SC-006**: On a spec seeded with a known self-contradiction, the automatic barrage surfaces that contradiction (the feature catches the class of defect that motivated it — the `specs/002` "author introduced 3 contradictions" failure mode).
- **SC-007**: A spec cannot graduate to the next Spec Kit step until the audit-protocol convergence criterion (FR-010: 0 HIGH + 0 MEDIUM in one iteration, or 0 HIGH across two consecutive iterations) is met or an override is recorded — verifiable in the run record (no spec graduates carrying open HIGH findings without a recorded override).
- **SC-008**: An iterative governance run that cannot converge terminates in a recorded **non-converged** state within the configured iteration ceiling — it never loops unbounded (verifiable: the run record shows either convergence, a recorded override, or a non-converged terminal state).

## Assumptions

- **Audit-barrage + audit-protocol source**: this feature composes BOTH the existing barrage capability AND the `dw-lifecycle` audit protocol (convergence criterion + finding state machine) in-house (FR-006); it does NOT wait for the `multi/migrate-audit-barrage` migration and does NOT build a second implementation of either. Fail-loud-if-absent is the contract until the migration rehomes them. The migration's scope therefore includes the protocol, not only the barrage.
- **Findings home (default, pending FR-010/FR-012 resolution)**: findings are recorded in the existing audit-log-style durable store already used by the implementation-phase governance, extended to carry the spec checkpoint context — rather than inventing a separate spec-only findings artifact. This keeps SC-005 (one surface) cheap. Revisit if clarify selects a mechanism that makes a spec-local artifact more natural.
- **Synchronous / iterative (resolved by FR-010)**: the gate is an iterative convergence loop, so the barrage result must be available before graduation — the gate waits for convergence. The loop itself can run unattended (fix-and-re-barrage) and is bounded (FR-014) for the all-night case.
- **Artifact scope (default for FR-013)**: the spec is always in scope; the plan is included only if a `after_plan` checkpoint is selected (FR-011).
- **Naming / branch**: built on the shared `feature/pluggable-lifecycle-providers` branch under `specs/004-spec-governance/` (one branch per worktree; spec dir is flat creation-order, the `design/spec-governance` codename is the identity).
- **Sequence**: this is the second feature in the resequenced design-phase block (after `design/insight-capture`), per `stack-control-roadmap.md`. It is independently shippable.

## Dependencies

- The in-house audit-barrage capability AND the `dw-lifecycle` audit protocol (convergence criterion + finding state machine), both composed in-house today (in `dw-lifecycle`; both migrating later under `multi/migrate-audit-barrage`) — FR-006.
- The Spec Kit extension/hook mechanism and/or the front-door `define`/`extend` skills (`multi/front-door`, COMPLETE) — the delivery surface (FR-012).
- The constitution principles inherited: no-fallbacks/fail-loud, cross-model agreement as the HIGH-confidence signal, in-house composition with honest coupling, detection-over-instruction.
