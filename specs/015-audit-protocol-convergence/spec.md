# Feature Specification: Audit-protocol convergence correctness + incremental audit units

**Codename**: `multi/audit-protocol-convergence`

**Feature Branch**: `feature/audit-protocol` (session-pinned; not a per-feature branch)

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "Address the audit-protocol convergence issues (the cross-model audit-barrage loop that plateaus and can only terminate by operator override), AND investigate auditing smaller units of work incrementally instead of one giant audit-governance pass at the very end of implementation, AND re-evaluate using sonnet on those smaller units."

## Why this feature exists (thesis grounding)

stack-control's organizing thesis is **invest heavily in up-front design and tooling; industrialize execution** — and the **teeth** of that industrialization are *stochastic correctness*: a cross-model audit-barrage that converges to a mechanically-trustworthy stop signal without relying on operator mood or attention. The 014 audit-barrage-reliability work made the barrage's *spawns* reliable (model pinning, derived timeouts, mechanical read-only, terminal states, watchdog). This feature makes the **convergence protocol itself** trustworthy, and shrinks the **unit of work** the barrage audits so the teeth bite cheaply and often.

The motivating evidence is concrete and recent. Governing 014's own implementation (2026-06-11, 7+ rounds) exposed three convergence pathologies and one structural gap:

1. **The loop plateaus and cannot mechanically terminate.** Rounds 4–7 each surfaced exactly one new HIGH finding via the lift's max-of-cluster severity, while each finding's own prose self-assessed low/latent blast radius. Because every fix round re-audits its own fix-code, consistency-seam findings keep arriving and the two-consecutive-raw-0-HIGH branch never engages. The loop had **no convergence path except operator override** (backlog TASK-27).
2. **The convergence loop is not code — the agent is the loop controller.** The protocol runs one `render → barrage → lift → slush → gate` pass; the *re-run / stop* decision lives in skill prose, so the agent is simultaneously the fixer and the loop-controller. A deterministic rule becomes discretionary in practice. This contradicts the thesis directive *make failure states mechanically impossible; do not rely on the agent following a rule in a document* (TASK-18 Facet B).
3. **The barrage audits one giant unit at the very end of implementation.** Governance fires once per whole feature (`after_implement`), folding the whole-feature diff (soft budget 256 KB) into one payload. A large unit means many findings per round, heavy fix-debt compounding, slow high-latency model spawns, and a self-referential payload (the feature's own audit-log excerpt is fed back to the barrage). There is **no per-task or per-phase audit surface** today.
4. **The cheaper/faster model fleet was disqualified on the giant unit.** sonnet was excluded for two reasons: it violated read-only mid-audit (now mechanically prevented by 014's `--permission-mode plan`), AND it ran 2226 s + off-task (59 tool calls) on a 69 KB payload. Both disqualifiers are coupled to **payload size and enforcement** — exactly the levers this feature moves.

These threads interlock. Shrinking the audit unit (thread 3) is the lever the others hang off: fewer findings per round attacks the plateau (thread 1) and the fix-debt compounding; a smaller diff shrinks the self-reference window; smaller payloads scale the per-model timeout down (`secs_per_kb × kb`) and, under mechanical read-only, rehabilitate cheaper models (thread 4). The severity-de-inflation fix and the mechanical loop driver (threads 1, 2) are the convergence teeth themselves — the code-audit analog of the spec-audit diminishing-returns discipline.

This is **detection over instruction**: make the failure state (a barrage loop that grinds forever, or graduates falsely, or audits a unit too large to converge) mechanically surfaced and mechanically bounded, rather than relying on an operator to notice the plateau and override.

## Clarifications

### Session 2026-06-11 (investigation findings — verified from source)

Before any change, the current mechanics were verified from source so the scope is grounded, not assumed:

- **TASK-18 Facet A (slush-before-dampener collapses the FR-010 branches) is ALREADY FIXED in code.** The dampener counts *raw* surfaced severity by `Severity:` line regardless of `Status:` (branch (a): `rawHighPlusCount === 0 && rawMediumCount === 0`; branch (b): `rawHighPlusCount === 0`). The slush no longer subverts the branches. This thread needs only a **regression test** that pins the raw-counting behavior and the backlog item closed — NOT a fix.
- **The cluster severity is `max(SEVERITY_RANK)` across the cluster, and the per-lane severities are discarded at lift.** The merged finding keeps only the cluster max; `crossModelAgreement` is pure existence-clustering (`sourceModels.length >= 2`), with **no severity-agreement signal**. One lane's HIGH on a finding the other lanes rate MEDIUM inflates the whole cluster to HIGH, so the two-consecutive-raw-0-HIGH branch can never engage. This is the plateau's root cause (thread 1).
- **The multi-round loop is skill-body prose, not a code driver.** One protocol pass runs `render → barrage → lift → slush → gate`; the gate emits a single OPEN/BLOCKED boolean the consumer obeys (hard stop), but the *iterate-again?* decision and the FR-014 iteration ceiling are not enforced by code (thread 2).
- **The implement-mode payload folds the whole-feature diff + the feature's own audit-log excerpt (last 40 lines) + untracked files.** The audit-log fold is the self-referential vector; the untracked fold pulls in parked scaffolds (thread 3 / the #431 family).
- **Model calibration (69 KB payload):** opus 586 s (shipped default), fable 669–750 s (thoroughness override), codex 123–290 s (secondary lane), haiku 271 s (excluded — zero verification depth), sonnet 2226 s + off-task (excluded). Timeout is derived `max(floor, secs_per_kb × payload_kb)`.

### Open design forks (to be resolved in `/speckit-clarify`)

Three decisions materially shape the feature and have no single reasonable default; they are marked `[NEEDS CLARIFICATION]` in the requirements and carried into clarify:

1. **Severity de-inflation mechanism** (the crux of threads 1/2) — see FR-001.
2. **Incremental audit unit granularity** (thread 3) — see FR-007.
3. **Model fleet re-admission criterion** (thread 4) — see FR-011.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The convergence loop reaches a clean stop instead of plateauing (Priority: P1) 🎯 MVP

An agent (or unattended driver) runs the governance convergence loop over a unit of implemented work. When the surviving findings are all single-lane labels on issues the rest of the fleet rated lower, or are low-blast-radius consistency-seam findings on the prior round's fix-code, the loop **reaches a mechanically-computed clean stop** — it does not plateau at one-inflated-HIGH-per-round with operator override as the only exit.

**Why this priority**: This is the core defect and the whole point of the convergence half of the feature. Without it, the audit protocol cannot self-terminate, which defeats the unattended-execution thesis. It delivers value on its own: even with the audit unit unchanged, a loop that converges instead of grinding is strictly better than the status quo.

**Independent Test**: Replay the 014 rounds-4–7 finding stream (a single-lane HIGH per round on a finding the other lane rated MEDIUM/LOW) through the gate and confirm the dampener engages at the genuine terminal instead of staying disengaged indefinitely.

**Acceptance Scenarios**:

1. **Given** a cluster where one lane rated a finding HIGH and ≥1 other covering lane rated the same root cause MEDIUM or lower, **When** the lift records the finding's gate-counted severity, **Then** the recorded severity reflects cross-lane severity agreement (not a single lane's max) per the FR-001 mechanism, and the per-lane severities remain recoverable on disk.
2. **Given** a sequence of rounds whose only HIGH findings are single-lane inflations, **When** the convergence gate evaluates, **Then** the two-consecutive-raw-0-HIGH branch becomes reachable and the loop converges without an override.
3. **Given** a genuine cross-lane-agreed HIGH (≥2 lanes independently rate it HIGH), **When** the gate evaluates, **Then** it remains BLOCKED — de-inflation MUST NOT suppress real HIGHs.

---

### User Story 2 - Loop termination is enforced by code, not by the agent's discretion (Priority: P1)

When the convergence loop runs, the decision to iterate again or to stop — and the bounded iteration ceiling (FR-014 of the governance protocol) — is owned by a **code driver**, not by prose the agent is trusted to follow. The agent performs fix-dispatch *inside* a not-yet-converged loop and never holds the "re-run?" decision.

**Why this priority**: The thesis is *make failure states mechanically impossible*. A loop whose controller is the same agent that is fixing findings is structurally unable to be unattended or trustworthy. Builds directly on US1 (the stop signal US1 makes correct must also be mechanically obeyed).

**Independent Test**: Drive the loop driver with a stub barrage that returns a BLOCKED gate N+1 times where N is the ceiling; confirm the driver terminates at the ceiling with a recorded non-converged outcome and returns control, with no agent-side decision involved.

**Acceptance Scenarios**:

1. **Given** a loop driver and a gate that returns OPEN, **When** the driver runs, **Then** it stops and reports graduation without re-running.
2. **Given** a gate that stays BLOCKED, **When** the driver reaches the configured iteration ceiling, **Then** it terminates with a recorded non-converged terminal state (never loops unbounded).
3. **Given** the driver is running, **When** a round completes, **Then** the only agent action available between rounds is fix-dispatch on the surfaced findings — the iterate/stop decision is the driver's.

---

### User Story 3 - The barrage does not audit its own findings or parked scaffolds (Priority: P2)

When the barrage fires, the payload contains the unit of work under audit — not the feature's own prior audit-log, and not unrelated parked-feature scaffolds swept in by an untracked-file fold. Findings are about the work, not about the audit record of the work.

**Why this priority**: Self-referential payload is a finding *generator* — it manufactures findings about the audit-log's own prose, which never converge. Removing the generator is a precondition for US1 converging on real signal. Lower than US1/US2 because it narrows the input rather than fixing the stop logic.

**Independent Test**: Render the barrage payload for a feature with a populated audit-log and an untracked parked scaffold; confirm the rendered payload excludes the feature's own audit-log content and the unrelated scaffold.

**Acceptance Scenarios**:

1. **Given** a feature with a non-empty audit-log, **When** the implement-mode payload is rendered, **Then** the feature's own audit-log content is not embedded in the audited material.
2. **Given** untracked files unrelated to the unit of work, **When** the payload folds untracked content, **Then** unrelated parked scaffolds are excluded by a bounded, explicit rule (not swept in wholesale).

---

### User Story 4 - Work is audited in smaller incremental units, not one giant end-of-implementation pass (Priority: P2)

Instead of one barrage over the whole-feature diff at `after_implement`, an agent can audit a **smaller unit of work** (e.g. a completed phase or task) as it lands, so each barrage sees a bounded payload, surfaces fewer findings, compounds less fix-debt, and converges faster.

**Why this priority**: This is the lever the convergence fixes hang off — it attacks the plateau (fewer findings/round), the fix-debt compounding, the self-reference window, and the model-latency wall simultaneously. P2 because US1/US2 must hold for the smaller-unit loops to terminate correctly; smaller units without a correct stop signal just multiply grinding loops.

**Independent Test**: Define a unit boundary over a multi-phase tasks.md, run the incremental audit on a single completed unit, and confirm the barrage payload is scoped to that unit's diff (not the whole feature) and produces its own recorded audit section.

**Acceptance Scenarios**:

1. **Given** a unit of work smaller than the whole feature (per the FR-007 granularity), **When** the incremental audit fires, **Then** the barrage payload is scoped to that unit's diff and the unit's own audit record, not the whole feature.
2. **Given** several units audited incrementally, **When** each unit's loop converges, **Then** the whole-feature `after_implement` governance is reduced to (or composes from) the already-converged units rather than re-auditing everything from scratch.
3. **Given** an incremental unit audit, **When** it runs, **Then** the same convergence protocol (US1/US2) governs its loop — the unit boundary changes the payload, not the protocol.

---

### User Story 5 - Cheaper/faster models are re-evaluated and admitted on the smaller units (Priority: P3)

With the audit unit smaller (US4) and read-only mechanically enforced (014), the previously-excluded faster models — sonnet in particular — are re-calibrated on the bounded payloads and admitted to the fleet when they meet a defined quality/latency bar, restoring cross-model genetic diversity at lower cost.

**Why this priority**: Model diversity is the reason to run a barrage at all; cheaper models that were unviable on a 69 KB unit may be viable on an 8 KB unit. P3 because it depends on US4 (smaller units) existing and US1/US2 (a correct loop) to evaluate against; it is an optimization on top of a working protocol.

**Independent Test**: Calibrate sonnet on a representative small-unit payload under `--permission-mode plan`; record latency and finding quality against the FR-011 bar; confirm the admit/reject decision is recorded with its evidence.

**Acceptance Scenarios**:

1. **Given** a small-unit payload and mechanical read-only enforcement, **When** sonnet is spawned, **Then** it cannot mutate the repo (the 014 read-only incident is mechanically impossible) and its latency/quality are recorded.
2. **Given** sonnet's recorded calibration against the FR-011 bar, **When** the fleet config is decided, **Then** the admit-or-reject decision and its evidence are recorded (no silent inclusion/exclusion).

---

### User Story 6 - The already-fixed raw-counting behavior is guarded against regression (Priority: P3)

The dampener's raw-severity counting (the #432 fix that resolved TASK-18 Facet A) is pinned by a regression test, so a future refactor cannot silently reintroduce the slush-before-dampener collapse.

**Why this priority**: Cheap insurance on an already-correct behavior the rest of the feature depends on. P3 because it changes no behavior — it prevents a known-bad behavior from returning.

**Independent Test**: Feed the dampener an audit-log where a run surfaced MEDIUMs later slushed; confirm branch (a) does NOT engage on that run (raw count includes the slushed MEDs).

**Acceptance Scenarios**:

1. **Given** a run that raw-surfaced ≥1 MEDIUM later flipped to `acknowledged-slush-pile`, **When** the dampener evaluates branch (a), **Then** it does NOT engage (the raw MEDIUM count is non-zero).
2. **Given** a run that raw-surfaced a HIGH later marked `fixed-<sha>`, **When** the dampener evaluates branch (b), **Then** that run does NOT count as a 0-HIGH run.

### Edge Cases

- **A cluster where lanes disagree on severity but all agree the finding exists**: the FR-001 mechanism decides the gate-counted severity; existence-agreement (`cross-model-agreed`) remains an orthogonal confidence annotation and MUST NOT be conflated with severity.
- **A single-lane HIGH with no other covering lane** (below-quorum fleet): de-inflation MUST NOT silently downgrade it on the assumption it "would have clustered"; a single covering lane's HIGH still blocks (consistent with 004 FR-003).
- **An incremental unit whose fix touches a prior unit**: the unit boundary must define whether the prior unit is re-audited or held converged (FR-007 / FR-009 of the governance protocol's append-only record).
- **The loop driver running unattended hits the ceiling**: it records non-converged and returns control; it never auto-edits the work and never loops unbounded (mirrors 004 FR-014).
- **A re-admitted model later degrades** (latency creep, off-task): the fleet config decision is re-evaluable against the same recorded bar; admission is not permanent.
- **Smaller units increase total barrage invocations**: the per-unit payload shrinks but the count rises; the timeout-derivation and watchdog (014) must hold at the smaller payload sizes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** *(severity de-inflation — the convergence crux)*: The system MUST stop a single lane's severity label from inflating a cross-lane cluster's gate-counted severity, so that the convergence dampener's two-consecutive-raw-0-HIGH branch is reachable when the only HIGHs are single-lane inflations. The per-lane severities MUST be preserved on disk (recoverable), not collapsed to a single max at lift. Real cross-lane-agreed HIGHs MUST still block (no suppression of genuine signal). `[NEEDS CLARIFICATION: which de-inflation mechanism — (A) preserve per-lane severities + require ≥2 covering lanes to agree on HIGH before the cluster is gate-counted HIGH (single-lane HIGH still recorded, but as its own severity/confidence pair); (B) keep max-of-cluster but add a gate-side plateau / diminishing-returns detector (a code-audit analog of the spec-audit diminishing-returns rule) that flags "feeding a generator" and routes to adjudication/override; (C) an adjudication LLM pass that re-scores survivors on cross-lane severity agreement + the finding's own blast-radius prose + reachability + fix-debt classification, feeding the gate a calibrated severity. These are not mutually exclusive — A is the cheapest mechanical fix; C is the richest; B is the safety net.]`
- **FR-002**: When de-inflation changes a cluster's gate-counted severity, the system MUST record both the per-lane raw severities AND the resulting gate-counted severity in the durable audit record, so the decision is auditable and the dampener's raw count is reproducible.
- **FR-003**: The confidence annotation (`cross-model-agreed` vs `single-model`, existence-clustering) MUST remain orthogonal to severity; FR-001 changes how severity is computed, never how existence-agreement is flagged.
- **FR-004** *(mechanical loop driver)*: The convergence loop MUST be driven by code that owns the iterate/stop decision and the bounded iteration ceiling — not by skill-body prose. The driver consumes the gate's single OPEN/BLOCKED boolean, terminates on OPEN, and terminates with a recorded non-converged outcome at the ceiling. The agent's only in-loop action is fix-dispatch on surfaced findings.
- **FR-005**: The loop driver MUST be invocable unattended (no operator present) and MUST terminate deterministically in every case (OPEN → graduate; ceiling → non-converged; override → graduate-with-recorded-reason). It MUST NOT auto-edit the work under audit.
- **FR-006** *(self-referential payload)*: The barrage payload MUST exclude the unit's own prior audit-log content from the audited material, and MUST exclude unrelated parked-feature scaffolds from any untracked-file fold (bounded, explicit inclusion rule — not a wholesale sweep).
- **FR-007** *(incremental audit unit)*: The system MUST support auditing a unit of work smaller than the whole feature, scoping the barrage payload to that unit's diff and audit record, governed by the same convergence protocol (FR-001/FR-004). `[NEEDS CLARIFICATION: unit granularity — per-phase (tasks.md phase grouping, the natural existing boundary; moderate payloads, moderate invocation count), per-task (finest grain; smallest payloads, highest invocation count and most cross-task-seam re-audit), or per-commit (aligns with the diff the agent just produced; variable size). Also: does whole-feature `after_implement` governance compose from the already-converged units, or still run a final whole-feature pass?]`
- **FR-008**: An incrementally-audited unit's findings MUST be recorded in the same append-only per-feature audit store as whole-feature governance (one record, two granularities), so a later whole-feature pass can see what each unit already converged.
- **FR-009**: The incremental audit MUST NOT weaken any 014 reliability guarantee at the smaller payload sizes — model pinning, derived timeouts, mechanical read-only, terminal states, and the liveness watchdog MUST all hold for the smaller units.
- **FR-010** *(Facet-A regression guard)*: The system MUST carry a regression test pinning the dampener's raw-severity counting (a run's slushed MEDIUMs still count against branch (a); a run's fixed HIGH still counts the run as non-0-HIGH for branch (b)), so the #432 fix cannot be silently reverted.
- **FR-011** *(model fleet re-admission)*: The system MUST support re-evaluating previously-excluded models (sonnet specifically) on the smaller-unit payloads under mechanical read-only, and MUST record the admit/reject decision with its calibration evidence (no silent fleet changes). `[NEEDS CLARIFICATION: the re-admission bar — what measured thresholds gate admission (e.g. latency ceiling at the target unit-payload size, minimum finding depth/verification behavior, off-task tolerance), and is admission to the default fleet or to an operator-selectable override profile like the existing fable thoroughness override?]`
- **FR-012**: Every behavior change in this feature MUST land RED-first (a failing test seen failing for the expected reason before the fix), per the project constitution; the 014 isolation constraint holds (the dw-lifecycle barrage copy is not touched).

### Key Entities *(include if feature involves data)*

- **Cluster severity decision**: for a cross-lane finding cluster, the set of per-lane raw severities plus the resulting gate-counted severity and the rule that produced it (FR-001/FR-002). Replaces the current "max-of-cluster, per-lane discarded" record.
- **Convergence loop driver**: the code component that runs rounds, consumes the gate boolean, counts iterations against the ceiling, and emits a terminal outcome (converged / overridden / non-converged). Owns the decision the skill prose currently holds.
- **Audit unit**: the bounded scope of one barrage payload — whole-feature today; per-phase/per-task/per-commit under FR-007. Carries its diff scope, its audit record section, and its convergence outcome.
- **Fleet admission record**: a model lane's calibration evidence (latency at a payload size, finding depth, read-only enforcement state) plus the recorded admit/reject decision against the FR-011 bar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A finding stream in which every HIGH is a single-lane inflation (the 014 rounds-4–7 shape) drives the convergence gate to a clean stop within a bounded number of rounds, with **zero operator overrides required** — verifiable by replaying the recorded finding stream through the gate.
- **SC-002**: For every cluster whose lanes disagreed on severity, the audit record shows both the per-lane raw severities and the gate-counted severity — **100% of de-inflated clusters are auditable** (no decision is unexplained).
- **SC-003**: A genuine cross-lane-agreed HIGH keeps the gate BLOCKED — de-inflation suppresses **zero** real HIGHs (verifiable: a seeded ≥2-lane HIGH never graduates without a fix or recorded override).
- **SC-004**: The convergence loop terminates without any agent-held iterate/stop decision in **100%** of runs (OPEN, ceiling, or override) — verifiable by driving the loop with a stub gate and observing deterministic termination with no agent branch.
- **SC-005**: The rendered barrage payload contains **zero** bytes of the unit's own prior audit-log content and **zero** unrelated parked scaffolds — verifiable by inspecting the rendered payload for a feature with a populated audit-log and a parked untracked scaffold.
- **SC-006**: An incrementally-audited unit produces a barrage payload measurably smaller than the whole-feature payload (target: a per-unit payload that puts the slowest admitted model under its derived timeout with margin), and its loop is governed by the same protocol — verifiable by comparing rendered payload sizes and confirming the same gate/driver path runs.
- **SC-007**: A previously-excluded model (sonnet) under mechanical read-only **cannot** mutate the repo across a hostile-probe run (zero new files, zero commits, zero pushes), and its admit/reject decision is recorded with calibration evidence — verifiable by the hostile-probe harness (014 SC-002 pattern) plus the recorded fleet decision.
- **SC-008**: The dampener's raw-counting regression test is present and fails if branch (a) is made to ignore slushed MEDIUMs or branch (b) to ignore fixed HIGHs — verifiable by mutation (revert the raw-count to open-count and observe the test go red).

## Assumptions

- **Builds on 014 (done):** model pinning, derived timeouts, mechanical read-only (`--permission-mode plan` / `--sandbox read-only`), terminal states, and the liveness watchdog are in place; this feature relies on them and must not weaken them.
- **Audit protocol source:** uses stack-control's own vendored barrage + audit protocol (the convergence criterion in `check-barrage-dampener.ts`, the lift in `extract-barrage-findings.ts`, the gate in `spec-governance-gate.ts`, the protocol chain in `src/govern/protocol.ts`). No dw-lifecycle dependency; the dw-lifecycle barrage copy is not touched (succession isolation).
- **The 004 spec-governance convergence rule (FR-010/014/015) is the canonical convergence semantics**; this feature changes *how severity is computed* (FR-001) and *who drives the loop* (FR-004), not the dampener's branch definitions.
- **spec-governance is not installed in this project's `extensions.yml`** (only `deskwork-governance` at `after_implement`); the convergence loop is dogfooded at the implement phase.
- **The three open forks (FR-001 mechanism, FR-007 granularity, FR-011 bar) are resolved in `/speckit-clarify`** before planning — they materially shape the implementation.
- **Branch:** authored on the session-pinned `feature/audit-protocol` (operator instruction), not a per-feature branch; the `before_specify` git.feature hook is intentionally bypassed for this session.

## Dependencies

- stack-control's own audit-barrage capability + audit protocol (vendored; FR-006 of 004). No dw-lifecycle dependency.
- The 014 audit-barrage-reliability primitives (spawn enforcement, timeout derivation, watchdog, terminal states) — this feature is the convergence-and-unit layer above them.
- The Spec Kit governance extension mechanism (`deskwork-governance` `after_implement`); incremental-unit invocation (FR-007) attaches to or composes from it.
- The constitution principles inherited: no-fallbacks/fail-loud, cross-model agreement as the HIGH-confidence signal, detection-over-instruction, make-failure-states-mechanically-impossible, RED-first.
