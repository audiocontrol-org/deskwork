# Feature Specification: Parallel, worktree-isolated, multi-backend execution engine

**Feature Branch**: `feature/pluggable-lifecycle-providers` (spec dir `specs/002-parallel-execution-engine`)

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Parallel, worktree-isolated, multi-backend EXECUTION engine for dw-lifecycle — the north-star 'execute' half (the slice after governance slice 001). deskwork takes a provider's dependency-annotated plan (concretely a Spec Kit tasks.md with its [P] markers and dependency ordering) and executes the plan's independent tasks concurrently, each isolated in its own git worktree, fanning the work across multiple pluggable execution backends, then reconciling results back. Differentiator: cross-backend execution across distinct LLM coding agents, not one vendor's subagents. CRITICAL CONSTRAINT: backends pluggable behind a capability port; the engine must NOT assume any backend's batch/headless CLI mode is available (vendors may sunset it); must support both in-session sub-agent dispatch and batch CLI shell-out, selecting/failing-over by declared capability never by vendor identity; fail loud when no backend can run. Respect the dependency graph; isolate per worktree; reconcile with conflicts surfaced; compose with slice-001 governance over a defined seam."

> **North star** (see `../../docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/prd.md` § North Star): deskwork as the provider-agnostic control plane that **governs** *and* **executes (parallel, multi-backend, worktree-isolated)** any provider's dependency-annotated plan. Slice 001 delivered the **governance half**. This slice delivers the **execution half** — the headline differentiator, because prior art parallelizes one model's sub-agents while nobody fans a plan across *distinct* coding agents.

> **Product home & strategy (operator decision 2026-06-04).** This feature belongs to a new plugin, **`stack-control`** (CLI binary `stackctl`; brand: stackcontrol.org), built in **this monorepo** as a new workspace package + plugin shell with its **own version line**, isolated from `dw-lifecycle`. `stack-control`'s **founding feature is slice 001** — the `deskwork-governance` Spec Kit `after_implement` extension built the prior session; **this parallel execution engine is Feature 2** (after Feature 0 plugin infrastructure + Feature 1 the `stackctl`/front-door slice), not the founding one. `stack-control` is the intended **successor to `dw-lifecycle`**: over subsequent slices it absorbs the keepers from `dw-lifecycle` (scope-discovery, audit-barrage, session-start/session-end, …) and rehomes slice 001 itself; once `stack-control` reaches parity, `dw-lifecycle` is retired. That migration is its **own multi-slice program** and is OUT OF SCOPE for this spec. Isolation rationale: `dw-lifecycle` is in active use doing real work; `stack-control` must be developed and published without destabilizing it. Consequence for the execution→governance seam (FR-017/FR-018): it crosses the plugin boundary today (`dw-lifecycle` owns audit-barrage) and is designed to remain a one-way seam when governance later moves into `stack-control`.

> **Scope: the PARALLEL engine only — re-scoped 2026-06-04 (resequence).** Execution has two modes (native Spec-Kit-with-extensions + the parallel multi-backend engine), but the 2026-06-04 resequence split them across features: **native execution rides in Feature 1** (`stackctl` + the thin control-plane front door, which triggers the native `/speckit-implement` mechanism with governance firing), and **this spec covers ONLY the parallel multi-backend engine** (the differentiator), as **Feature 2**, built *through* the Feature-1 front door. The earlier "add a native-mode user story to this body" item is therefore **dissolved** — native execution is specced under Feature 1, not here. This spec stays **paused** until the front door (Feature 1) exists.

> **Two distinct pluggability axes — keep them straight.** (1) The **provider / plan-source port** (where the plan comes from) is **deferred** in this slice: it is built **concretely against Spec Kit's `tasks.md`**; provider generalization comes in a later slice (operator decision 2026-06-04 — build against one real provider first, generalize once it works). (2) The **execution-backend port** (how each task is run — in-session sub-agent vs. batch CLI) is **fully in scope** here — it is the heart of the slice and carries the operator's batch-CLI-resilience constraint. "Build against Spec Kit first" applies to axis (1) only; axis (2) stays pluggable.

## Clarifications

### Session 2026-06-06

- Q: v1 backend roster (FR-015) → A: in-session sub-agent dispatch + **two distinct batch-CLI backends** (three backends total) — chosen so cross-backend fan-out across distinct coding agents (US3) is demonstrated, not merely asserted.
- Q: Single-task-failure disposition (FR-019) → A: v1 is conservative — **retry the failed task once**; on a second failure, record it, skip its dependents, and **continue the run** (reconciled with the unattended directive below — "halt" applies to the task's lineage, not the whole run). A richer resilience layer (configurable retry policies + per-backend circuit breakers, drawing on established microservices practice) is captured as **required future work**, explicitly NOT built in this slice (operator decision — capture, don't build; Principle II). See FR-019, FR-020.
- Q: Task → backend assignment policy (FR-010/FR-015) → A: **capability-match first, then round-robin** across the eligible backends.
- Q: Overarching operational mode → A: **fully unattended — "a system that can run all night with no operator input"** (operator directive 2026-06-06). The engine never blocks on a prompt; every decision point auto-resolves or quarantines-and-continues; a run always ends with a report. This directive governs the FR-007 and FR-019 resolutions. See FR-021, SC-010/SC-011.
- Q: Reconcile/merge policy (FR-007) → A: **isolated per-run integration branch + per-task auto-merge (no operator gate); preserved per-task branches; governance runs after, one-way non-blocking; operator promotes the run branch off the critical path.** See FR-007.
- Q: Reconcile-conflict handling refinement (operator) → A: conflicts are NOT parked for the operator by default — the engine resolves each conflict as a **dispatched task** (capability-selected backend, given both tasks' intent) and validates the resolution via **cross-model audit-barrage** before landing it (resolve-then-audit); retry-once then quarantine ONLY when an audited resolution fails. This keeps runs fully unattended (FR-021) while guarding against bad auto-merges, and is kept distinct from the one-way post-run governance seam (FR-018). See FR-007, FR-022, SC-005, SC-012.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execute an independent-task tranche in parallel, each isolated, then reconcile (Priority: P1) 🎯 MVP

A maintainer hands the engine a dependency-annotated plan. The engine identifies the set of tasks whose dependencies are all already satisfied (the eligible tranche), executes those tasks **concurrently** — each in its own isolated git worktree so their file writes cannot collide — and, as each completes, reconciles its result back toward the integration branch. The maintainer gets the combined result of many tasks done in the wall-clock time of roughly the slowest single task, not the sum.

**Why this priority**: This is the smallest faithful proof of the north-star execution half — parallelism + isolation + reconcile over a real plan. Everything else (backend independence, cross-backend fan-out, multi-tranche scheduling, governance) layers on top of this core loop. Without it there is no execution engine.

**Independent Test**: Feed a plan containing N tasks with no dependencies between them; observe N isolated worktrees created, the N tasks running concurrently (overlapping in time), and each task's changes reconciled into the integration branch with no cross-task file clobbering.

**Acceptance Scenarios**:

1. **Given** a plan with N mutually-independent tasks, **When** the engine runs, **Then** it creates one isolated worktree per concurrently-executing task and the tasks execute overlapping in time (not strictly sequentially).
2. **Given** N tasks executing in isolated worktrees, **When** each completes, **Then** its changes are reconciled toward the integration branch and no task's output overwrites another's silently.
3. **Given** the run completes, **When** the maintainer inspects the integration branch, **Then** it contains the combined result of all N tasks.

---

### User Story 2 - Backend independence: the run survives loss of any one backend's batch mode (Priority: P1)

The same plan must execute correctly regardless of *how* the underlying coding work is dispatched. The engine talks to execution backends only through a capability port. It supports at least two backend kinds — (1) **in-session sub-agent dispatch**, executing a task via the host Claude session's sub-agent mechanism, and (2) **batch CLI shell-out**, spawning an external LLM coding CLI headlessly — and a run completes whether both are available or only one is. Backend selection and fail-over are decided by each backend's **declared capabilities**, never by a hardcoded vendor/tool name. If a backend's batch mode becomes unavailable, eligible work routes to an available backend.

**Why this priority**: This is the operator's load-bearing constraint and the reason the engine is durable: AI-coding vendors may sunset batch/headless CLI usage (e.g. a vendor deprecating its headless print mode). An engine hardwired to one dispatch mechanism dies when that mechanism is withdrawn. Capability-based pluggability is what makes the engine outlive any single vendor's CLI surface — and it mirrors the constitution's Principle III (branch on capabilities, never provider identity).

**Independent Test**: Run the same plan three ways — both backend kinds enabled, only the in-session backend enabled, and only a batch-CLI backend enabled — and confirm the run completes in all three. Then grep the engine's backend-selection path and confirm zero branches on a vendor/tool name.

**Acceptance Scenarios**:

1. **Given** only the in-session sub-agent backend is available (every batch CLI disabled), **When** the engine runs a plan, **Then** the plan completes — proving no hard dependency on batch/headless CLI.
2. **Given** only a batch-CLI backend is available, **When** the engine runs the same plan, **Then** the plan completes.
3. **Given** a task is assigned to a backend whose batch mode has become unavailable, **When** the engine schedules it, **Then** the task routes to another backend that declares the required capability, without operator intervention.
4. **Given** the engine selects a backend for a task, **When** its selection logic is inspected, **Then** the decision is made from declared capabilities only, with no branch on a vendor/tool identity string.

---

### User Story 3 - Cross-backend fan-out across distinct coding agents (Priority: P2)

In a single run, the engine distributes the eligible tasks across **two or more distinct** execution backends simultaneously — e.g. some tasks executed by one coding agent and others by a different one — rather than confining all parallelism to a single vendor's sub-agents.

**Why this priority**: This is the headline differentiator versus prior art (MAQA, Fleet, single-model sub-agent parallelism). It is a strict superset of US1's parallelism and depends on the US2 backend port existing, so it follows them.

**Independent Test**: Enable two distinct backends, run a plan whose tranche has at least two independent tasks, and confirm the run record attributes different tasks to different backends within the same execution.

**Acceptance Scenarios**:

1. **Given** at least two distinct backends are enabled and a tranche has ≥2 independent tasks, **When** the engine runs, **Then** the run distributes tasks across ≥2 distinct backends concurrently.
2. **Given** a completed cross-backend run, **When** the maintainer inspects the run record, **Then** it shows which backend executed each task.

---

### User Story 4 - Dependency-respecting multi-tranche scheduling (Priority: P2)

For a plan with dependency edges, the engine sequences work as a series of tranches: a task becomes eligible only once **all** its dependencies have completed; the engine runs each eligible tranche in parallel, then recomputes eligibility and runs the next tranche, until the plan is exhausted.

**Why this priority**: Real plans (a Spec Kit `tasks.md`) have dependency ordering, not just a flat independent set. US1 proves a single tranche; this proves correct sequencing across the whole graph. It builds directly on US1.

**Independent Test**: Feed a plan with a known dependency chain (A → B, with C independent); confirm B never starts before A completes, while C may run alongside A.

**Acceptance Scenarios**:

1. **Given** task B depends on task A, **When** the engine schedules, **Then** B does not start until A has completed.
2. **Given** task C has no dependencies, **When** the first tranche runs, **Then** C is eligible in that tranche alongside other dependency-free tasks.
3. **Given** a plan whose remaining tasks all still have unmet dependencies and none are in progress, **When** the engine evaluates eligibility, **Then** it halts with a descriptive error rather than looping or silently completing (a dependency cycle / unsatisfiable plan is surfaced, not swallowed).

---

### User Story 5 - Execution → governance seam (Priority: P3)

When a run (or tranche) completes, the engine produces a well-defined handoff that slice-001 governance consumes to audit the produced work — without manual glue. The engine does not re-implement governance; it exposes the seam governance needs (which work was produced, where) so the existing cross-model audit-barrage can run over it.

**Why this priority**: The north star is *govern + execute*. Governance already exists (slice 001); this slice must compose with it rather than duplicate it. The seam is the integration point, but it depends on a completed run existing first, so it is last.

**Independent Test**: Run the engine to completion over a plan, then confirm slice-001 governance can be invoked over the run's produced work using only the handoff the engine emits (no hand-assembled inputs).

**Acceptance Scenarios**:

1. **Given** a completed engine run, **When** governance is invoked, **Then** it audits the run's produced work using only the engine's emitted handoff.
2. **Given** the seam, **When** it is inspected, **Then** governance consumes execution output one-way and the engine never depends on governance internals (clean, one-directional seam).

---

### Edge Cases

- **No backend can run an eligible task** (every backend declaring the required capability is unavailable): the engine fails loudly with a descriptive error naming the missing capability — it does NOT silently skip the task or fall back to mock output (Principle V).
- **Reconcile conflict** between two parallel tasks' changes: the engine dispatches the conflict resolution as a task to a capable backend (given both tasks' intent), validates the candidate resolution with audit-barrage, and lands it if sound; on an audit-failed resolution it retries once then quarantines that task and continues. It does NOT silently pick a winner, land an unaudited resolution, halt the whole run, or wait for the operator (FR-007 / FR-022 / FR-021).
- **Empty eligible tranche but unfinished plan** (dependency cycle or unsatisfiable edge): surfaced as an error, not an infinite wait or false "done."
- **A single task fails inside its backend**: the engine retries once; on a second failure it records the failure, does not start that task's dependents, and continues independent work (FR-019) — the run is not halted and does not wait for the operator (FR-021).
- **Worktree creation fails** (dirty tree, disk, name collision): surfaced as an error before dispatch; no partial silent execution.
- **Provider's source plan artifact**: never written to by the engine (one-way authority, Principle IV) — progress/state lives in deskwork's substrate, not the provider's `tasks.md`.
- **Mid-run loss of a backend's batch mode**: in-flight tasks on that backend are handled per the fail-over rule (route remaining eligible work to an available backend); already-started work's disposition is an open policy question (see clarify).

## Requirements *(mandatory)*

### Functional Requirements

**Plan intake & scheduling**

- **FR-001**: The engine MUST read the **Spec Kit `tasks.md`** for the active feature (its `[P]` parallel markers + the "Dependencies" section) and determine, at each scheduling step, the set of tasks whose dependencies are all satisfied (the eligible tranche). **This slice is built concretely against Spec Kit** — generalizing the plan source to other providers (a normalized manifest / provider port) is explicitly deferred to a later slice. *(Operator decision 2026-06-04: build it against one real provider first so we know we're building something that actually works, then generalize.)*
- **FR-002**: The engine MUST execute the tasks in an eligible tranche concurrently, up to a bounded maximum concurrency.
- **FR-003**: The engine MUST recompute eligibility after each tranche and continue until all tasks are complete, respecting all dependency edges (a task never starts before its dependencies complete).
- **FR-004**: The engine MUST detect an unsatisfiable state (non-empty remaining plan, empty eligible set, nothing in progress — i.e. a dependency cycle) and fail with a descriptive error rather than hang or report false completion.

**Isolation & reconcile**

- **FR-005**: The engine MUST execute each concurrently-running task in its own isolated git worktree so parallel tasks' file writes cannot collide.
- **FR-006**: The engine MUST reconcile each completed task's changes back toward the integration branch.
- **FR-007**: On a reconcile conflict, the engine MUST NOT silently choose a winner and MUST NOT halt the run. **Reconcile policy (resolved 2026-06-06 — unattended operation; conflict-as-task refinement):** each task runs on its own **preserved per-task branch**; the engine creates an **isolated per-run integration branch** off the feature-branch tip and **sequentially auto-merges** completed task branches into it, with **no operator gate**. When a merge conflicts, the engine does NOT park it for the operator by default — it **dispatches the conflict resolution as a first-class task** through the execution-backend port (a capability-selected backend, which may be the orchestrating agent itself), giving the resolver **both conflicting tasks' intent** (from the plan) plus the conflicted merge state so it resolves *semantically*, not just textually. The engine then **validates the candidate resolution with cross-model audit-barrage** (FR-022) before landing it: a **sound** verdict → the resolution merges into the run integration branch; an **unsound** verdict → the engine **retries the resolution once** (incorporating the audit feedback) and, only if it still fails, **quarantines** that task (branch preserved, marked blocked, dependents not started) and continues other work. The engine never lands an unaudited or silently-chosen resolution (SC-005); it never halts the run and never waits for operator input (FR-021); quarantine is the last resort, reserved for genuinely ambiguous conflicts whose audited resolution cannot be trusted. The resolution diff and its audit verdict are recorded in the run record. Governance also runs afterward over the run branch, one-way and non-blocking (FR-017/FR-018). The operator promotes the completed run branch into the feature branch at their discretion; **promotion is never on the run's critical path**.
- **FR-008**: The engine MUST NOT write to the provider's source plan artifact; execution progress/state is recorded in deskwork's own substrate, one-way (Principle IV).

**Backend port & capabilities (the durability constraint)**

- **FR-009**: The engine MUST talk to execution backends only through a capability port; it MUST NOT branch on a vendor/tool identity anywhere in backend selection or dispatch (Principle III).
- **FR-010**: Each backend MUST declare its capabilities (at minimum: which dispatch mechanism it provides and whether it is currently available); the engine MUST select and fail-over among backends using these declarations only. **Assignment policy: capability-match first (filter to backends declaring the required capability), then round-robin across the eligible set** — fair, fully capability-driven (Principle III), and naturally produces cross-backend fan-out (US3).
- **FR-011**: The engine MUST support at least two backend kinds: (a) **in-session sub-agent dispatch** via the host session's sub-agent mechanism, and (b) **batch CLI shell-out** to an external coding CLI.
- **FR-012**: The engine MUST run a plan to completion when only the in-session backend is available AND when only a batch-CLI backend is available — i.e. it MUST NOT hard-depend on any batch/headless CLI being present.
- **FR-013**: When a backend assigned a task becomes unavailable (e.g. its batch mode is withdrawn), the engine MUST route the task to another backend that declares the required capability.
- **FR-014**: When no available backend declares the capability an eligible task requires, the engine MUST fail loudly with a descriptive error naming the missing capability — no silent skip, no mock output (Principle V).
- **FR-015**: In a single run, the engine MUST be able to distribute tasks across two or more distinct backends concurrently (cross-backend fan-out). **v1 roster: in-session sub-agent dispatch + two distinct batch-CLI backends (three backends total)** (operator decision 2026-06-06). The two distinct batch CLIs make the cross-backend, distinct-coding-agent differentiator (US3) demonstrable rather than merely asserted. *(The specific external CLIs are an availability/research detail for `/speckit-plan`; the engine still selects among all three by declared capability only — Principle III — never by their identity.)*

**Run record & governance seam**

- **FR-016**: The engine MUST record a run artifact capturing, per task: which backend executed it, success/failure, and where its output landed.
- **FR-017**: On run/tranche completion, the engine MUST emit a handoff that slice-001 governance can consume to audit the produced work, without manual assembly of governance inputs.
- **FR-018**: The execution→governance seam MUST be one-directional (governance reads execution output; the engine does not depend on governance internals).

**Failure semantics**

- **FR-019**: When an individual task fails inside its backend, the engine MUST **retry it once**; if the retry also fails, the engine MUST record the failure against that task in the run artifact, **NOT start the failed task's dependents**, and **continue executing independent tasks** — the run proceeds unattended and terminates (with a report) only when no eligible work remains. *(Reconciled 2026-06-06 with the unattended-operation directive, FR-021: the operator's "retry once, then halt" applies to the failed task's **lineage** — its dependents do not start — not to the whole run; a single double-failure must not end an overnight run. The richer retry/circuit-breaker policy remains captured-and-deferred, FR-020.)*
- **FR-020** *(captured, deferred — NOT built in this slice)*: A richer execution-resilience layer is **required future work**: configurable retry policies (backoff, max-attempts) and per-backend **circuit breakers**, drawing on established microservices practice (where there is substantial prior art). v1 deliberately ships only the minimal retry-once-then-continue of FR-019; the fuller policy is its own future slice. Captured per operator decision (Principle II — capture, don't build); recorded here so the need is not lost, with no v1 implementation obligation.

**Unattended operation (the load-bearing operator directive)**

- **FR-021**: The engine MUST run a plan to completion **fully unattended** — it MUST NOT block on, or wait for, operator input at any point during a run. Every decision point either resolves automatically and safely or **quarantines** the affected task (preserving its artifacts and recording it for later review) and continues. A run ALWAYS terminates with a written report; it NEVER pauses awaiting a prompt, a merge approval, or a conflict resolution. *(Operator directive 2026-06-06: "a system that can run all night with no operator input." This governs FR-007 reconcile-conflict handling — auto-resolve-then-audit, quarantine only as last resort — and FR-019 task-failure handling — retry-once then continue.)*
- **FR-022**: When the engine auto-resolves a reconcile conflict (FR-007), it MUST **validate the candidate resolution before landing it**, using **cross-model audit-barrage** (slice-001 governance, applied concretely) as the sanity check — a resolution lands only on a sound audit verdict; an unsound verdict triggers one retry then quarantine. The engine MUST NOT land a conflict resolution that has not passed this check. *(This inline resolution-validation is DISTINCT from the post-run execution→governance seam of FR-017/FR-018: that seam stays strictly one-way — governance reads produced work, the engine does not depend on governance internals — whereas here the engine deliberately consumes an audit verdict to gate a resolution it produced. Conceptually a verification capability; per Principle II it is built concretely against audit-barrage in v1 and NOT abstracted into a port until a second validator exists.)*

### Key Entities *(include if feature involves data)*

- **Plan**: the provider's dependency-annotated unit of work (first concrete instance: a Spec Kit `tasks.md`). Authoritative for INTENT; never mutated by the engine.
- **Task**: a single unit within a plan, with an id, a description/intent, and zero or more dependency references.
- **Dependency edge**: a "task X requires task Y complete" relation; defines tranche eligibility.
- **Tranche**: the set of currently-eligible (all-dependencies-satisfied) tasks scheduled to run concurrently.
- **Execution backend**: a pluggable adapter that runs a task. Two kinds in scope: in-session sub-agent dispatch; batch CLI shell-out.
- **Backend capability**: a declared property of a backend (dispatch mechanism, current availability, …) — the only thing the engine branches on.
- **Worktree**: an isolated git working tree in which a single concurrent task executes.
- **Per-task branch**: the branch a task's worktree commits to — **preserved** after the run as a durable artifact (audit trail, rollback point, the concrete "where output landed" the run record references).
- **Run integration branch**: an isolated branch created per run off the feature-branch tip, into which completed per-task branches are auto-merged; the assembled run result the operator later promotes (FR-007).
- **Reconcile/integration result**: the outcome of merging a task's per-task branch into the run integration branch (clean-merged; auto-resolved-and-audited-then-merged; or quarantined-after-failed-audit).
- **Conflict-resolution task**: a first-class task whose input is a conflicted merge (base + both sides) plus both conflicting tasks' intent, and whose output is a candidate resolution; dispatched through the capability port like any other task (FR-007).
- **Resolution-sanity audit**: the cross-model audit-barrage verdict over a candidate conflict resolution; gates whether the resolution lands (FR-022).
- **Run record**: the per-run artifact (per-task backend attribution, status incl. retried/failed/quarantined, conflict-resolution diffs + audit verdicts, output location / branch ref).
- **Governance handoff**: the one-way seam describing the produced work for slice-001 governance to audit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a plan with K mutually-independent tasks, the engine executes them concurrently — wall-clock time is materially less than the sum of the individual task times (the tasks overlap in time), demonstrating real parallelism rather than sequential execution.
- **SC-002**: The same plan completes successfully in **all three** backend configurations — both backend kinds enabled, in-session only, and batch-CLI only — proving the engine has no hard dependency on batch/headless CLI availability.
- **SC-003**: A single run distributes tasks across **≥2 distinct backends** concurrently, evidenced by per-task backend attribution in the run record.
- **SC-004**: The engine's backend-selection path contains **zero** branches on a vendor/tool identity string; all selection is capability-driven (verifiable by inspection/grep).
- **SC-005**: For every reconcile conflict between parallel tasks, the engine produces a candidate resolution (dispatched as a task) and validates it via audit-barrage before landing — **0** silent or unaudited overwrites. A resolution lands only on a sound audit verdict; an audit-failed resolution is retried once then quarantined (never silently merged, never halting the run).
- **SC-006**: When no available backend declares an eligible task's required capability, the engine fails with a descriptive error naming the missing capability — **0** silent skips and **0** mock outputs.
- **SC-007**: The provider's source plan artifact is **byte-unchanged** before vs. after a run (one-way authority).
- **SC-008**: A completed run produces a governance handoff that slice-001 governance consumes with **no** manually-assembled inputs.
- **SC-009**: For a plan with a dependency chain, **100%** of dependent tasks start only after their dependencies complete (no early starts observed across the test plan).
- **SC-010**: A run started with no terminal/operator attached completes with **0** prompts and **0** blocking waits — every reconcile conflict and retry-exhausted task failure is quarantined and recorded, and the run terminates with a written report rather than waiting for input (unattended operation, FR-021).
- **SC-011**: After a run, the feature/integration branch the operator works from is **unchanged** unless the operator explicitly promotes the run branch — the engine assembles onto an isolated per-run integration branch, so an unattended run never mutates the operator's working branch on its own (FR-007).
- **SC-012**: In an unattended run, the engine resolves and lands conflict resolutions **autonomously** for every conflict whose audited resolution is sound — **0** operator interactions during the run. Only conflicts whose audited resolution still fails after one retry are quarantined for later review, and the run still completes (FR-007/FR-022).

## Assumptions

These are reasonable defaults chosen where the description did not fix a detail. They are **starting positions to confirm in `/speckit-clarify`**, not scope cuts (Constitution Principle II — capture, then scope):

- **Concurrency bound** (FR-002): default to a host-derived bound (e.g. roughly available cores minus a headroom margin, capped by tranche width). *Deferred from the 2026-06-06 clarify session to `/speckit-plan`* — the default is low-risk; confirm the exact formula at planning.
- **Task → backend assignment policy** (FR-010/FR-015): **RESOLVED (2026-06-06)** — capability-match first, then round-robin across eligible backends. See FR-010.
- **Single-task-failure disposition** (FR-019): **RESOLVED (2026-06-06)** — retry the failed task once, then halt the run. See FR-019; the richer retry/circuit-breaker policy is captured-and-deferred in FR-020.
- **Plan source is Spec Kit `tasks.md`, concretely** (operator decision 2026-06-04 — no provider abstraction in this slice; generalize after it demonstrably works). The engine's internal task/dependency model is a private engine detail, NOT a published provider port.
- **Integration target** is the feature's integration branch in the same repository; worktrees are git worktrees under that repo.
- **Governance** (slice 001) already exists and is the consumer of the execution→governance seam; this slice defines the seam and does not modify governance internals.
- **Mid-run already-started-work disposition** on backend loss: default to letting in-flight work finish where possible and routing only not-yet-started eligible work. *Deferred from the 2026-06-06 clarify session to `/speckit-plan`* (edge policy; default is low-risk).
- **Dual driver (forward design).** The execution capability must be drivable by BOTH `stackctl` (CLI) and a future `stack-control` control-plane frontend. The engine's entry point, run record, and governance handoff are therefore **interface artifacts, not CLI-private** — no CLI-only coupling (e.g. progress/state is a readable artifact, not just terminal output). The control-plane frontend itself (spec-creation UI, spec→implementation negotiation, scope-discovery + audit-barrage surfaces) is a separate future feature, OUT OF SCOPE here.
