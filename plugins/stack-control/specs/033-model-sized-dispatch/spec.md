# Feature Specification: Model-Sized Dispatch — Declarative Per-Task Model Tiers for Subagent Execute

**Feature Branch**: `033-model-sized-dispatch`

**Created**: 2026-06-28

**Status**: Draft (revised 2026-06-28 — adopt-superpowers direction)

**Input**: User description: "Change the default /stack-control:execute behavior so it dispatches each task in tasks.md to a sub-agent (rather than running tasks serially inline in the host session), and let each task declare its required model capability tier (a semantic label like fast/balanced/powerful) in its tasks.md metadata; the execute dispatch selects the matching model for that sub-agent. This is a standalone feature, separate from the broader impl:feature/execution-engine (specs/002) parallel+worktree engine."

**Direction (operator decisions, 2026-06-28)**: After investigating the superpowers plugin's
execution skills (`subagent-driven-development`, `dispatching-parallel-agents`,
`executing-plans`), the operator chose to **adopt superpowers' subagent-execution stance**
rather than build a bespoke mechanical engine, and to add only a **thin, backend-agnostic
declarative model-tier layer** on top. Concretely:

- **Adopt superpowers' stance as-is.** Execution uses the proven subagent-driven-development
  discipline — a fresh subagent per task with isolated context, TDD, a task-review loop, and a
  progress ledger — with serial-with-review for dependent work and parallel dispatch for
  genuinely independent batches **by controller judgment**. This feature does **not** build a
  mechanical dependency-DAG scheduler, cycle detector, or wave engine. (That mechanical
  parallel+worktree engine remains `impl:feature/execution-engine` / specs/002.)
- **Backend-agnostic tier discipline.** This feature defines the model-tier convention and the
  model-selection discipline and applies them itself within `/stack-control:execute`; it does
  **not** hard-depend on the superpowers plugin being installed. stack-control stays
  self-contained and portable across its host targets (Claude Code, Codex).

The feature's contribution is to make superpowers' model-selection advice — *"use the least
powerful model that can handle each role; always specify the model explicitly when
dispatching a subagent"* — **declarative and operator-controlled**: each task names its model
tier in `tasks.md`, an operator-configured tier map resolves the tier to a concrete model, and
the dispatch specifies that model explicitly. Sizing stops being per-session controller
guesswork and becomes a reviewable property of the plan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Declare a model tier per task; dispatch uses the right-sized model (Priority: P1) 🎯 MVP

An operator annotates each task in `tasks.md` with a semantic model tier (e.g. `[tier:fast]`,
`[tier:powerful]`). When `/stack-control:execute` dispatches a subagent for a task, it resolves
that task's declared tier to a concrete model via the operator-configured tier map and
dispatches the subagent **explicitly at that model**. Mechanical, well-specified tasks run on a
cheap/fast model; tasks needing deeper reasoning run on a more capable model — and which is
which is declared in the plan, not decided per session.

**Why this priority**: This is the entire point of the feature — right-sized models per task,
declaratively. It delivers the cost/speed benefit of model-sizing while making the sizing a
reviewable, durable property of the plan rather than per-session controller judgment.

**Independent Test**: Prepare a `tasks.md` with tasks declaring different tiers and a tier map
in config. Invoke `/stack-control:execute`. Confirm each dispatched subagent is invoked with
the model the task's declared tier resolves to — and that a task declaring `[tier:fast]` and a
task declaring `[tier:powerful]` receive different, correct models.

**Acceptance Scenarios**:

1. **Given** a task declaring `[tier:fast]` and the tier map `fast → <cheap-model>`, **When**
   the execute dispatch reaches that task, **Then** its subagent is dispatched explicitly with
   `<cheap-model>`.
2. **Given** two tasks declaring different tiers, **When** they are dispatched, **Then** each
   subagent runs with the model its own tier resolves to — neither receives the other's model.
3. **Given** the operator changes a task's declared tier in `tasks.md`, **When** execute is
   re-run, **Then** the new tier's model is used — the sizing follows the plan, not the session.
4. **Given** a completed run, **When** the operator inspects the execution record/ledger,
   **Then** each task's declared tier and the model it was dispatched with are visible.

---

### User Story 2 - Missing or unknown model tier fails loud before dispatch (Priority: P1)

A task has no declared tier, or declares a tier not present in the configured tier map. The
dispatch refuses that task **loudly** — naming the task and the missing or unrecognized tier —
rather than silently inheriting the session's model or guessing one. All such errors are
reported together, before any subagent is dispatched. Tasks with valid tiers still run.

**Why this priority**: Silent fallback (quietly dispatching an undeclared task at the session's
default model) is exactly the failure mode model-sizing exists to eliminate, and it violates
the no-fallback principle (Constitution Principle V). Surfacing all tier errors up front lets
the operator fix the plan/config before any work begins.

**Independent Test**: Prepare a `tasks.md` where one task omits a tier and another declares a
tier absent from the map. Invoke the tier-resolution step. Confirm both are reported as named
errors before any dispatch, and that valid-tier tasks would still resolve normally.

**Acceptance Scenarios**:

1. **Given** a task with no declared tier, **When** tiers are resolved before dispatch, **Then**
   a named error is produced ("task X has no model tier declared") and that task is not
   dispatched.
2. **Given** a task declaring a tier absent from the tier map, **When** tiers are resolved,
   **Then** a named error is produced ("task X declares unknown tier Y") and that task is not
   dispatched.
3. **Given** a mix of valid and invalid tier declarations, **When** resolution runs, **Then**
   all tier errors are reported together before any dispatch; valid-tier tasks resolve normally.
4. **Given** the configured tier map is absent or malformed when a tiered task is resolved,
   **When** resolution runs, **Then** it fails loud naming the missing/malformed map, before any
   dispatch.

---

### User Story 3 - Execute adopts the subagent-dispatch discipline (Priority: P2)

`/stack-control:execute` dispatches each task to a **fresh subagent with isolated context**
(constructed from the task's brief, not the host session's accumulated history), following the
proven subagent-driven-development discipline: the subagent works test-first, self-reviews, and
commits; a task review follows; progress is tracked in a durable ledger so a resumed/compacted
session does not re-dispatch completed tasks. Whether independent tasks are dispatched in
parallel or dependent tasks run serially-with-review is **controller judgment per the adopted
superpowers stance** — this feature adds no mechanical scheduler. The one thing this feature
makes non-negotiable in that discipline is that **every dispatch specifies its model explicitly**
(from the task's resolved tier), never inheriting the session default.

**Why this priority**: Adopting the proven discipline (rather than reinventing it) is what makes
"dispatch each task to a subagent" robust; pinning the explicit-model rule to the declared tier
is what closes the silent-default gap superpowers' prose leaves to controller diligence.

**Acceptance Scenarios**:

1. **Given** a task is dispatched, **When** its subagent is constructed, **Then** the subagent
   receives an isolated, task-scoped brief (not the host session's history) and is invoked with
   the model its declared tier resolved to — explicitly, never an inherited default.
2. **Given** a run is resumed after interruption, **When** execute consults the progress ledger,
   **Then** tasks already recorded complete are not re-dispatched.
3. **Given** the controller judges a set of tasks genuinely independent, **When** it dispatches
   them, **Then** it MAY dispatch them in parallel (adopted stance); when tasks are dependent,
   they run in the plan's order — neither behavior is mechanically enforced by this feature.

---

### Edge Cases

- What if a task declares a tier but no tier map is configured at all? Resolution fails loud,
  naming the absent map, before any dispatch (no silent inheritance of the session model).
- What if the tier map maps a tier to a model the host's dispatch surface does not accept? The
  configuration is rejected loudly when the map is loaded/validated, before any dispatch.
- What if every task in the plan has a tier error? Resolution reports all errors and no subagent
  is dispatched.
- How is ordering/parallelism decided? By the adopted superpowers stance (controller judgment on
  independence), NOT by a mechanism in this feature. This feature is silent on scheduling beyond
  resolving each task's model.
- What about concurrent subagents writing the same files? That risk is owned by the adopted
  stance (superpowers goes serial precisely to avoid it) and by per-task worktree isolation,
  which is out of scope here (specs/002). This feature does not introduce parallel shared-tree
  dispatch on its own.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A task in `tasks.md` MUST be able to declare a model tier as a semantic label
  (e.g. `[tier:fast]`) in its task metadata. The label is a tier name, never a model identifier
  (Constitution Principle III).
- **FR-002**: When `/stack-control:execute` dispatches a subagent for a task, it MUST resolve the
  task's declared tier to a concrete model via the operator-configured tier map and MUST specify
  that model explicitly on the dispatch (never inherit the session's default model).
- **FR-003**: Tier resolution MUST depend solely on the declared tier label and the configured
  tier map; it MUST NOT branch on model vendor/identity (Constitution Principle III).
- **FR-004**: When a task declares no tier, resolution MUST produce a named error for that task
  and that task MUST NOT be dispatched (Constitution Principle V — no silent fallback to a
  default/session model).
- **FR-005**: When a task declares a tier absent from the tier map, resolution MUST produce a
  named error for that task and that task MUST NOT be dispatched.
- **FR-006**: All tier resolution MUST complete before any subagent is dispatched; the operator
  sees the complete set of tier errors before any work begins.
- **FR-007**: The tier-to-model map MUST be operator-configurable and MUST NOT be hardcoded in
  the execute path.
- **FR-008**: When the tier map is absent or malformed at resolution time for a tiered task,
  resolution MUST fail loud naming the absent/malformed map, before any dispatch.
- **FR-009**: `/stack-control:execute` MUST dispatch each task to a fresh subagent with
  isolated, task-scoped context (not the host session's accumulated history), adopting the
  subagent-driven-development discipline (test-first, self-review, task review, durable progress
  ledger).
- **FR-010**: Execute MUST track per-task progress in a durable record so a resumed or compacted
  session does not re-dispatch a task already recorded complete.
- **FR-011**: The declared tier and the resolved model for each dispatched task MUST be
  observable in the execution record (FR-010's ledger or the run output).
- **FR-012**: This feature MUST NOT introduce a mechanical dependency-DAG scheduler, cycle
  detector, or wave engine; ordering and parallelism are governed by the adopted superpowers
  stance (controller judgment). (Explicitly bounds scope away from specs/002.)
- **FR-013**: This feature MUST remain self-contained — it MUST NOT hard-depend on the
  superpowers plugin being installed; it adopts the *discipline/patterns*, applied within
  stack-control's own execute skill.

### Key Entities

- **Task (tier-annotated)**: A unit of work in `tasks.md` with an identifier, a body that becomes
  the subagent's brief, and a declared model **tier** label.
- **Model Tier**: A semantic label (e.g. `fast`, `balanced`, `powerful`) declared by a task.
  Never a model identifier; resolved to a model via the tier map.
- **Tier Map**: The operator-configured mapping from tier labels to concrete model identifiers,
  stored in the installation configuration. Absent labels and out-of-range model values produce
  loud failures.
- **Tier Resolution**: The pre-dispatch step that maps every task's declared tier to a model (or
  a named error), producing the complete error set before any dispatch.
- **Dispatch Discipline**: The adopted subagent-driven-development practice the execute skill
  applies — fresh per-task subagent, isolated brief, explicit model, task review, durable ledger.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every dispatched subagent is invoked with the model its task's declared tier
  resolves to; zero tasks are dispatched at a model not matching their declared tier (or at an
  inherited session default).
- **SC-002**: A `tasks.md` containing any task with a missing or unknown tier produces a named
  error for each such task and zero silent dispatches of those tasks; the full error set is
  emitted before any dispatch.
- **SC-003**: Changing a task's declared tier in `tasks.md` (or the tier map in config) changes
  the model the task is dispatched with on the next run, with no code change — the sizing is
  fully data-driven (FR-007).
- **SC-004**: The declared tier and resolved model for each task are visible in the execution
  record after a run (FR-011).
- **SC-005**: A resumed/compacted execute run does not re-dispatch a task the durable ledger
  already records complete (FR-010).
- **SC-006**: `/stack-control:execute` operates with the superpowers plugin absent — the tier
  discipline is applied by stack-control itself (FR-013).

## Assumptions

- The execute path adopts the **patterns** of superpowers' subagent-driven-development and
  dispatching-parallel-agents (fresh per-task subagent, explicit model, task review, progress
  ledger, judgment-driven parallel-for-independent); it does not invoke the superpowers plugin
  as a runtime dependency (FR-013). The patterns are reproduced within stack-control's execute
  skill so the behavior is identical whether or not superpowers is installed.
- Ordering and parallelism are the controller's judgment under the adopted stance; this feature
  is deliberately silent on scheduling beyond per-task model resolution. The mechanical
  dependency-DAG + worktree-isolated parallel engine remains `impl:feature/execution-engine`
  (specs/002).
- A "model tier" is an operator-chosen semantic label mapped to a model via the tier map; model
  identifiers are never embedded in `tasks.md`, keeping the plan model-agnostic (Principle III).
- The tier map is part of the stack-control installation configuration accessible to the execute
  path; the concrete storage shape is fixed at the planning phase (the existing
  `.stack-control/config.yaml` is the expected home).
- A missing tier is a **loud error**, not a silently-applied default tier (Principle V). An
  optional operator-configured *default tier* is explicitly captured as a possible future
  scoping decision, not part of this feature (a default tier is a fallback, which Principle V
  forbids by default).
- Per-task worktree isolation, batch-CLI backends, cross-vendor multi-backend fan-out, and any
  mechanical scheduler remain out of scope (specs/002).
- **Cross-host explicit-model dispatch portability** (open question): FR-002 (explicit model on
  dispatch) and FR-009 (fresh per-task subagent) assume the host exposes a **per-dispatch
  model-selection surface**. Claude Code provides this (the Agent/Task dispatch accepts an
  explicit model); whether Codex (the other stated portability target) exposes an equivalent
  per-subagent model-selection surface is **not yet established** — resolve it when the Codex
  port is actually exercised. The `stackctl resolve-tiers` verb (the testable core) is
  host-agnostic; only the dispatch step (skill prose) depends on the host surface. If a host
  cannot select a model per dispatch, the dispatch step MUST fail loud naming the missing host
  capability (Principle V), never silently inherit the session default.
