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

### Session 2026-06-07 (governance findings — self-hosted dogfood)

The feature governed its own spec (T024). Nine findings were lifted; their resolutions are encoded below.

- Q (AUDIT-01/-02, HIGH cross-model): the gate criterion is written in "HIGH/MEDIUM" but the spec overloads those across two orthogonal axes — **confidence** (cross-model agreement) and **severity**. Which does the gate count? → A: **Severity.** The ported convergence criterion counts finding **severity** (`blocking`/`high`/`medium`); **confidence** is a separate annotation renamed to `cross-model-agreed | single-model` so the two never collide. This dissolves AUDIT-02: a single-model HIGH-**severity** finding still blocks the gate (it does not become un-blockable just because only one family flagged it).
- Q (AUDIT-08): FR-002 says the barrage MUST run multiple families — is a single-family *outcome* valid? → A: **The barrage MUST attempt all configured families in parallel; a run with ≥1 healthy family is a valid, successful audit recorded with honest reduced coverage (FR-008).** The floor is one healthy family (the cross-model-agreement signal is simply unavailable below two). Matches the as-built barrage + the 2026-06-01 "1 healthy model IS a successful audit" directive.
- Q (AUDIT-05): when both `after_clarify` and `after_plan` are enabled, how do the loop + ceiling compose? → A: **Independent per-checkpoint loops with independent ceilings.** Each checkpoint runs its own convergence loop over its own artifact set; passing the `after_clarify` gate is **durable** and is NOT re-opened by `after_plan` findings. The iteration ceiling (FR-014) is **per-checkpoint**, not global.
- Q (AUDIT-03): the two-consecutive-iteration branch requires only 0 HIGH — what happens to open MEDIUM findings at graduation? → A: **The asymmetry is intentional (it is the ported protocol).** Open MEDIUM findings at two-consecutive convergence are **carried open** per FR-007 (preserved, visible in the run record) — never silently dropped, never auto-accepted.
- Q (AUDIT-04): the barrage is non-deterministic — what is an "iteration" and what makes two "consecutive"? → A: **An iteration is one recorded barrage run** (one audit-log lift section). "Consecutive" = the last N recorded runs **for that checkpoint**, regardless of whether the spec text changed between them; an inter-iteration edit does NOT reset the count. Two-consecutive-quiet is a **stability heuristic**, not a determinism proof. The FR-014 ceiling counts recorded runs.
- Q (AUDIT-07): all configured families are available but **all** error/time out mid-run (zero healthy) — clean run or failure? → A: **Failure.** A zero-healthy run is treated identically to no-capability: **fail loud (FR-005), spec NOT recorded as governed** — distinct from a clean zero-*finding* run (FR-009, where ≥1 family ran and found nothing).
- Q (AUDIT-09): the Dependencies "and/or front-door skills" wording reopens the front-door-only path FR-012 forbids. → A: **The hook mechanism is mandatory;** front-door skills are listed only as callers that benefit from the universal hook, never as an alternative delivery surface.
- Q (AUDIT-06): SC-005's "one governance surface" vs the dw-lifecycle isolation constraint. → A: **Resolved by `multi/migrate-audit-barrage` (now done):** the barrage + protocol are vendored into stack-control, so spec-phase and implementation-phase governance share a single in-stack-control store — SC-005's single-surface claim is now literally true, with **no dw-lifecycle dependency** (FR-006 updated).

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
- **One model family available/healthy**: a **valid, successful run** recorded with reduced coverage (FR-002/FR-008) — the cross-model-agreement *signal* is unavailable below two families, but single-model findings still surface and the gate still counts their **severity** (a single-model HIGH-severity finding still blocks). One healthy family is the floor.
- **A model family times out or errors mid-run (but ≥1 succeeds)**: the run records partial coverage with the failure noted; it does not abort the whole barrage as long as at least one family was healthy.
- **ALL available families fail at runtime (zero healthy)**: treated identically to no-capability — **fail loud (FR-005)**, the spec is NOT recorded as governed. This is distinct from a clean zero-*finding* run (FR-009): "zero findings because ≥1 family ran and found nothing" is a recorded governed run; "zero findings because nothing ran" is an outage, never a clean result.
- **Spec re-revised after triage**: dispositions from the prior run are preserved; the new run re-surfaces still-open findings and any new ones (empty revisions beat missed changes — a re-run is never pre-emptively skipped as a no-op).
- **Barrage latency vs. the unattended directive**: the barrage can be slow and the gate is iterative (FR-010/FR-014); the convergence loop must run unattended (fix-and-re-barrage without operator presence) and remain bounded (FR-014) so a non-converging spec escalates rather than runs forever.
- **Governance never converges**: findings keep surfacing across iterations — the loop hits the configured iteration ceiling and records a non-converged terminal state / escalates to the operator (FR-014); it does not block indefinitely or loop unbounded.
- **Findings on a spec that is later abandoned/cancelled**: findings are recorded against the spec and persist with it (records preserve history; they are not deleted because the spec was abandoned).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST fire a cross-model audit-barrage over a spec **automatically** at a defined definition-time checkpoint, with no manual barrage invocation required.
- **FR-002**: The barrage MUST **attempt all configured model families in parallel** (for genetic diversity in failure modes), reusing the SAME barrage mechanism (render + fire + triage) as the implementation-phase governance rather than a parallel, separately-maintained implementation. A run with **≥1 healthy family** is a valid, successful audit recorded with honest coverage (FR-008); one healthy family is the floor (below two, the cross-model-agreement signal is simply unavailable — not an error). Zero healthy families is an outage (fail loud, FR-005).
- **FR-003**: The system MUST flag **cross-model agreement** (two or more model families flagging the same root cause) as a **confidence** annotation (`cross-model-agreed` vs `single-model`), distinguishable from single-model findings. Confidence is **orthogonal to severity**: a finding has both a confidence label (agreement) and a severity (`blocking`/`high`/`medium`/`low`/`informational`). The convergence gate (FR-010) counts **severity**, never confidence — the two axes MUST NOT be conflated.
- **FR-004**: The system MUST surface findings attributed per model family and route them into a triage workflow in which each finding receives an explicit, durably-recorded disposition.
- **FR-005**: The system MUST **fail loud when no audit capability is available** — it MUST NOT silently skip governance or report an ungoverned spec as governed (no-fallbacks principle).
- **FR-006**: The system MUST use **stack-control's own audit-barrage capability AND audit protocol** — the audit protocol being the iterative convergence criterion (FR-010) plus the finding state machine / triage discipline, not just the one-shot barrage primitive. **Both are now vendored in-package in stack-control** (`multi/migrate-audit-barrage`, pulled forward 2026-06-07 per operator directive that dw-lifecycle is not an allowed dependency): the barrage verbs dispatch through the bundled `stackctl`; the gate imports the convergence criterion from stack-control's own source. **There is NO dependency on dw-lifecycle** (no import, no shell-out, no `requires`). The system MUST still fail loud if the barrage capability or model families are absent (FR-005). The barrage + protocol are NOT reimplemented separately for spec governance — the same verbs serve both definition-time and implementation-time governance (one capability, two phases).
- **FR-007**: Findings MUST be recorded in a durable findings home with disposition state (e.g. open → fixed / acknowledged) that **survives across spec revisions**, so a later run can distinguish still-open findings from already-dispositioned ones.
- **FR-008**: When some but not all model families are available, the barrage MUST proceed with the available families AND **record reduced coverage** — degraded coverage must never be presented as full coverage.
- **FR-009**: A barrage run MUST be recorded even when it produces zero findings (a clean result is an outcome, not a skipped step), and a re-run MUST NOT be pre-emptively skipped as a presumed no-op (empty revisions beat missed changes).
- **FR-010** *(promotion gate — audit-protocol convergence)*: Spec-governance MUST gate progression to the next Spec Kit step on the **ported audit-protocol convergence criterion**, counting open-finding **severity** (FR-003 — never confidence): the gate is satisfied when **either** a single barrage iteration produces **0 open HIGH (or BLOCKING) and 0 open MEDIUM** findings, **or** **two consecutive iterations** each produce **0 open HIGH (or BLOCKING)** findings. The two branches are **intentionally asymmetric** (it is the ported protocol): the two-consecutive branch does not require 0 MEDIUM, so a spec MAY graduate via two-consecutive-quiet while open MEDIUM findings remain — those MEDIUMs are **carried open** per FR-007 (preserved and visible in the run record), never silently dropped or auto-accepted. An **iteration** is one recorded barrage run (FR-009); "**consecutive**" means the last runs **for the same checkpoint** (per-checkpoint scoping, FR-011/FR-014), regardless of whether the spec text changed between them — an inter-iteration edit does NOT reset the count; two-consecutive-quiet is a stability heuristic, not a determinism proof. Until the criterion is met the spec MUST NOT graduate — a machine-checkable gate mirroring `impl/execution-engine` FR-030; an explicit override (if used) MUST be recorded. This makes spec-governance an **iterative loop**: barrage → triage/fix the spec → re-barrage → … until convergence.
- **FR-011** *(hook point)*: The spec-barrage MUST fire at **`after_clarify`** (the spec is decision-complete then) and MUST be **configurable to also fire at `after_plan`**. `after_specify` is intentionally NOT the default — a spec at that point may still carry intentional unresolved-clarification placeholders, which would generate noise. When **both** checkpoints are enabled, each runs as an **independent convergence loop** (FR-014) over its own artifact set (FR-013): passing the `after_clarify` gate is **durable** and MUST NOT be re-opened by findings surfaced at `after_plan`.
- **FR-012** *(delivery mechanism)*: Spec-governance MUST be delivered as a **Spec Kit governance extension with hooks** (the hook mechanism is **mandatory**), mirroring the founding `deskwork-governance` `after_implement` extension, so it fires **universally** — whether the operator drives the front-door `define`/`extend` skills or raw `/speckit-*` commands. It MUST NOT be folded into the front-door skills only; the front-door skills are callers that benefit from the universal hook, never an alternative delivery surface.
- **FR-013**: The spec-barrage operates on the **spec** by default (the `after_clarify` checkpoint's artifact set); when the `after_plan` checkpoint is enabled (FR-011), that checkpoint's loop covers the **plan** (additive — spec + plan). No other artifacts are in scope.
- **FR-014** *(iterative convergence + bounded termination)*: The system MUST support repeated barrage iterations, tracking finding state across iterations (FR-007), until the FR-010 convergence criterion is met or an override is recorded. Each iteration MUST be a recorded run (FR-009). The loop MUST be **bounded** — if convergence is not reached after a configured iteration ceiling, the system MUST surface **non-convergence** (escalate to the operator / record a non-converged terminal state) rather than loop forever. The iteration ceiling is **per-checkpoint** (FR-011): each enabled checkpoint has its own loop and its own ceiling, counted over that checkpoint's recorded runs only — not a single global budget shared across checkpoints. This keeps the loop safe under the unattended/all-night directive.

### Key Entities *(include if feature involves data)*

- **Spec-barrage run**: one automatic invocation of the cross-model barrage over a spec at a checkpoint; carries the model families exercised, coverage (full/reduced), timestamp, and the produced findings. Recorded durably.
- **Finding**: a single issue raised by the barrage; carries the originating model family (or families, when agreement), a **confidence** label (`cross-model-agreed` when ≥2 families flag the same root cause, else `single-model`), an **orthogonal severity** (`blocking`/`high`/`medium`/`low`/`informational` — the axis the FR-010 gate counts), the cited spec location, and a disposition (open / fixed / acknowledged). Confidence and severity are independent: a finding can be `single-model` + HIGH-severity (still gate-blocking) or `cross-model-agreed` + low-severity.
- **Checkpoint (hook point)**: the definition-time moment at which the barrage fires (one or more of `after_specify` / `after_clarify` / `after_plan`). Each enabled checkpoint owns an **independent convergence loop** with its **own iteration ceiling** (FR-011/FR-014) over its own artifact set (FR-013); a passed checkpoint gate is durable across other checkpoints' runs.
- **Audit capability**: stack-control's **own** (in-package) barrage primitives + the available model families. Its presence/absence drives the fail-loud behavior (FR-005) and coverage recording (FR-008). No dw-lifecycle dependency (FR-006).
- **Audit protocol**: stack-control's **own** convergence discipline (vendored via `multi/migrate-audit-barrage`) — the iteration loop, the convergence criterion (0 HIGH+ severity + 0 MEDIUM in one iteration, or 0 HIGH+ across two consecutive), the finding state machine, and the bounded per-checkpoint iteration ceiling. Distinct from the barrage primitive (which produces findings in one pass); the protocol governs how many passes run and when the gate opens.
- **Governance run (iteration set)**: the sequence of barrage iterations for one spec graduation attempt; carries each iteration's run, the convergence outcome (converged / overridden / non-converged), and the iteration count vs. ceiling.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A spec that reaches the defined checkpoint has a barrage run recorded **with zero manual barrage invocations** — automatic governance is observable in the run record.
- **SC-002**: When ≥2 model families flag the same root cause, that finding is labeled **`cross-model-agreed`** (the HIGH-confidence signal) and is distinguishable from `single-model` findings in the output. (Confidence is an annotation, orthogonal to the severity the gate counts — FR-003.)
- **SC-003**: When no audit capability is available, the flow fails loud with an actionable message and the spec is NOT recorded as governed — **zero silent skips** across all runs.
- **SC-004**: Across a spec revised at least twice, findings persist with their dispositions — a re-run correctly distinguishes still-open findings from already-dispositioned ones (no disposition loss).
- **SC-005**: Spec-phase findings and implementation-phase findings appear in the **same format AND the same store** — a single in-stack-control governance surface, two phases. (Now literally true post-`multi/migrate-audit-barrage`: both phases use stack-control's own audit-barrage + the same per-feature audit-log; there is no cross-plugin store and no dw-lifecycle coupling to preclude it.)
- **SC-006**: On a spec seeded with a known self-contradiction, the automatic barrage surfaces that contradiction (the feature catches the class of defect that motivated it — the `specs/002` "author introduced 3 contradictions" failure mode).
- **SC-007**: A spec cannot graduate to the next Spec Kit step until the audit-protocol convergence criterion (FR-010: 0 open HIGH+ **severity** + 0 open MEDIUM in one iteration, or 0 open HIGH+ across two consecutive iterations for that checkpoint) is met or an override is recorded — verifiable in the run record (no spec graduates carrying open HIGH-severity findings without a recorded override; open MEDIUMs may remain via the two-consecutive branch and are carried open, not dropped).
- **SC-008**: An iterative governance run that cannot converge terminates in a recorded **non-converged** state within the configured iteration ceiling — it never loops unbounded (verifiable: the run record shows either convergence, a recorded override, or a non-converged terminal state).

## Assumptions

- **Audit-barrage + audit-protocol source**: this feature uses stack-control's **own** barrage capability AND audit protocol (convergence criterion + finding state machine), **vendored in-package** via `multi/migrate-audit-barrage` (pulled forward 2026-06-07). It does NOT depend on dw-lifecycle and does NOT build a second implementation — the same in-stack-control verbs serve both definition-time and implementation-time governance. Fail-loud-if-absent (the barrage capability / model families) remains the contract (FR-005).
- **Findings home**: findings are recorded in the per-feature audit-log durable store used by the implementation-phase governance (stack-control's own), carrying the spec checkpoint context — not a separate spec-only artifact. Post-migration this is a single in-stack-control store shared by both phases, so SC-005 (one surface) is literally satisfied, not just format-compatible.
- **Synchronous / iterative (resolved by FR-010)**: the gate is an iterative convergence loop, so the barrage result must be available before graduation — the gate waits for convergence. The loop itself can run unattended (fix-and-re-barrage) and is bounded (FR-014) for the all-night case.
- **Artifact scope (default for FR-013)**: the spec is always in scope; the plan is included only if a `after_plan` checkpoint is selected (FR-011).
- **Naming / branch**: built on the shared `feature/pluggable-lifecycle-providers` branch under `specs/004-spec-governance/` (one branch per worktree; spec dir is flat creation-order, the `design/spec-governance` codename is the identity).
- **Sequence**: this is the second feature in the resequenced design-phase block (after `design/insight-capture`), per `stack-control-roadmap.md`. It is independently shippable.

## Dependencies

- stack-control's **own** audit-barrage capability AND audit protocol (convergence criterion + finding state machine), vendored in-package via `multi/migrate-audit-barrage` (done) — FR-006. No dw-lifecycle dependency.
- The Spec Kit extension/hook mechanism (**mandatory** delivery surface — FR-012/AUDIT-09). The front-door `define`/`extend` skills (`multi/front-door`, COMPLETE) are callers that benefit from the universal hook, NOT an alternative delivery path.
- The constitution principles inherited: no-fallbacks/fail-loud, cross-model agreement as the HIGH-confidence signal, in-house composition with honest coupling, detection-over-instruction.
