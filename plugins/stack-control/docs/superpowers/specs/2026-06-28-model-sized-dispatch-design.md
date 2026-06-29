# Design Record: Model-Sized Dispatch — Declarative Per-Task Model Tiers for Subagent Execute

**Roadmap item**: `impl:feature/model-sized-dispatch`
**Date**: 2026-06-28
**Spec**: `specs/033-model-sized-dispatch/` (spec + plan + tasks already authored via the `extend` front door)
**Backend**: `superpowers:brainstorming`, bent by the stack-control design house rules (`stack-control-design-v1`)

> This record retroactively captures the **design level** the lifecycle skipped: the
> 033 spec was authored before a roadmap node or design record existed. The operator's
> design decisions (2026-06-28, "adopt-superpowers direction") are captured faithfully —
> nothing added, nothing cut (capture-over-yagni).

## Problem domain

`/stack-control:execute` today runs every task in `tasks.md` **serially, inline in the host
session**, with model sizing left to **per-session controller guesswork**. Two consequences:

1. **No reviewable sizing.** There is no durable, plan-level record of *which model each task
   should run on*. The decision evaporates with the session.
2. **Silent-default failure mode.** superpowers' own guidance — *"use the least powerful model
   that can handle each role; always specify the model explicitly when dispatching a
   subagent"* — is **prose left to controller diligence**. With nothing mechanical pinning it,
   it degrades silently to "everything runs on the session default model," which is exactly the
   waste (and the silent fallback, Constitution Principle V) that model-sizing exists to
   eliminate.

The feature's job: make model sizing a **declarative, operator-controlled, reviewable property
of the plan** rather than per-session judgment — while adopting (not reinventing) a proven
subagent-execution discipline.

## Solution space

Three approaches were weighed. The first is chosen; the latter two are rejected with reasons.

### Chosen — adopt superpowers' subagent stance + thin declarative tier layer

`/stack-control:execute` dispatches each task to a **fresh subagent with isolated, task-scoped
context** following the proven **subagent-driven-development** discipline (TDD, self-review, a
task-review loop, and a durable progress ledger). Ordering and parallelism are **controller
judgment** under the adopted stance (serial-with-review for dependent work; parallel dispatch
for genuinely independent batches) — this feature adds **no** mechanical scheduler.

On top of that stance, a **thin declarative model-tier layer**:

- Each task names a **semantic tier** (`[tier:fast]`, `[tier:powerful]`) in its `tasks.md`
  metadata — a tier *label*, never a model identifier.
- An operator-configured **`tier_map`** in `.stack-control/config.yaml` resolves tier → concrete
  model.
- A pre-dispatch verb **`stackctl resolve-tiers --spec <dir>`** resolves every task's tier and
  **fails loud** — naming each task and its missing/unknown tier, or the absent/malformed map —
  with the **complete error set surfaced before any subagent is dispatched**.
- Every dispatch then specifies its resolved model **explicitly**; the session default is never
  inherited.

Self-contained: it adopts superpowers' *patterns*, reproduced inside stack-control's own execute
skill, so behavior is identical whether or not the superpowers plugin is installed (FR-013).

**Why chosen**: delivers the cost/speed-by-plan benefit, makes sizing reviewable and durable,
closes the silent-default gap mechanically, and stays small and portable — without reinventing
subagent execution.

### Rejected — bespoke mechanical engine (dependency-DAG scheduler, cycle detector, wave engine)

Build a full mechanical execution engine that derives a dependency DAG from `tasks.md`, detects
cycles, schedules waves, and isolates parallel work in per-task worktrees.

**Rejected because**: it reinvents the proven subagent discipline, carries a large surface, and
couples model-sizing to a heavy scheduler. This is real work — but it is a **different
feature**: it remains `impl:feature/execution-engine` (specs/002). This feature explicitly adds
no scheduler, cycle detector, or wave engine (FR-012), and introduces no parallel shared-tree
dispatch on its own.

### Rejected — status-quo inline serial execution with per-session model guesswork

Keep today's behavior: run tasks serially inline; let the controller pick models per session.

**Rejected because**: sizing stays per-session controller judgment rather than a reviewable plan
property; the silent-default failure mode persists; and none of the cost/speed-by-plan benefit
is realized. This is the baseline the feature exists to replace.

## Decisions

1. **Tier is a semantic label, never a model id** (Constitution Principle III — branch on
   capability, never vendor identity). Model identifiers never appear in `tasks.md`; the plan
   stays model-agnostic.
2. **The tier map lives in `.stack-control/config.yaml`** as an additive `tier_map`,
   operator-configurable, never hardcoded in the execute path (FR-007). Changing a tier in
   `tasks.md` or a mapping in config changes the dispatched model on the next run with **no code
   change** (data-driven sizing, SC-003).
3. **Missing/unknown tier, absent/malformed map, out-of-range model → loud named error +
   refuse-to-dispatch** (Principle V — no silent fallback). The **full error set** is emitted
   **before any dispatch** (FR-004/005/006/008); valid-tier tasks still resolve.
4. **One CLI verb `stackctl resolve-tiers --spec <dir>`** owns the pre-dispatch gate. The only
   differentiated logic — tier parsing, tier resolution, config validation — lives in the
   testable CLI core (`src/execute/`, `src/config/`) as the TDD floor; model values are
   validated against the dispatch surface's accepted-model **capability** set, not a hardcoded
   vendor list.
5. **Durable per-task progress ledger** so a resumed/compacted execute run does not re-dispatch a
   task already recorded complete (FR-010, SC-005). The declared tier and resolved model per task
   are **observable** in the execution record (FR-011, SC-004).
6. **Faithful adoption, self-contained** (Principle VIII / FR-013): the subagent-driven-development
   and dispatching-parallel-agents *patterns* are reproduced within stack-control's execute skill;
   no runtime dependency on the superpowers plugin (SC-006).

## Open questions

- **(a) Optional operator-configured default tier** — explicitly **deferred**, not in this
  feature. A default tier is a fallback, which Principle V forbids by default; revisit only on an
  explicit operator scope decision.
- **(b) Canonical tier vocabulary** — `fast` / `balanced` / `powerful` are illustrative. Because
  the `tier_map` is operator data, the label set is open; whether stack-control ships a
  recommended default vocabulary is a scoping question, not settled here.
- **(c) Concrete ledger storage shape** for resume — the durable progress record's on-disk shape
  is fixed at the planning phase, not the design phase.

## Provenance

- **Operator decisions, 2026-06-28** ("adopt-superpowers direction"), recorded in
  `specs/033-model-sized-dispatch/spec.md` (Direction block + Assumptions) after investigating
  the superpowers execution skills (`subagent-driven-development`, `dispatching-parallel-agents`,
  `executing-plans`).
- **Spec Kit chain already authored** via `/stack-control:extend`: spec, plan, research,
  data-model, contracts, checklists, tasks all present at `specs/033-model-sized-dispatch/`.
- **Scope boundary**: the mechanical dependency-DAG + worktree-isolated parallel engine remains
  `impl:feature/execution-engine` (specs/002); per-task worktree isolation, batch-CLI backends,
  and cross-vendor multi-backend fan-out are out of scope here (FR-012/FR-013).
- **Lifecycle note**: this design record is the retroactive `designing`-phase artifact for the
  newly-captured roadmap node `impl:feature/model-sized-dispatch`; the `design:` pointer was set
  to this path on entry.
