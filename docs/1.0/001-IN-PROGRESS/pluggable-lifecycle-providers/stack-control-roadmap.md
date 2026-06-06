# stack-control — program roadmap

> **Status:** program-level capture (operator decisions, 2026-06-04 session). This document holds the *program* vision for `stack-control`; individual features have their own Spec Kit specs under `specs/`. No dates — milestones, not deadlines.

> **Revision pass — resequenced 2026-06-04 (self-hosting order).** After the exploratory slice-001 implementation and this session's architectural decisions, the operator resequenced the program around a **self-hosting** strategy: the **first feature is native Spec Kit execution itself** — a *thin* control plane (`stackctl` + frontend touch points) that can **curate a spec** and **run it via the native Spec Kit mechanism** (`/speckit-implement`, with governance firing), with the minimal plugin scaffolding folded into that same feature (option b — no separate infra feature). Then **use that front door to spec and build the rest of the plugin** (the parallel multi-backend engine, the migrations, the fuller frontend). The foundational docs were realigned to the stack-control architecture in the same pass. **Consequence:** the execution "two modes" split across features — native execution rides in the Feature 1 front door; the parallel multi-backend engine (the current `specs/002-parallel-execution-engine/`) becomes a later feature built *through* the frontend (this dissolves the earlier "add native mode to the 002 body" gap).

## Thesis (the organizing principle — read this first)

> **Invest heavily in up-front design and tooling; industrialize execution.**

stack-control is a **barbell**. The up-front half — design, scoping, spec authoring, insight capture, cross-model spec governance, scope discovery — is where human judgment and *all* the leverage live, so the control plane invests **disproportionately** there: rich, rigorous, low-friction, well-tooled. The back half — execution — is then **industrialized**: parallel, worktree-isolated, multi-backend, unattended, cheap to run. Execution is the commodity end; design is where value is created.

> **Full grounding** — the thesis, the hard-won principles, and the motivating blog post — lives in **[`stack-control-thesis.md`](./stack-control-thesis.md)**. Read it first.

**What this dictates:** the answer to *"how much should stack-control help with the up-front design and tooling part of product development?"* is **a great deal** — that is the point of the product, not a side quest. Features that make design richer, more rigorous, and lower-friction (insight capture, governing the spec, scope discovery, exploration of alternatives, rigorous iteration) are **first-class, heavily-resourced** work — at least equal to, and the source of leverage over, the execution engine. When weighing investment between a design-phase capability and an execution-phase one, the thesis tilts toward the design phase.

### The two halves of the thesis

| Half | Investment | Features |
|---|---|---|
| **Up-front design & tooling** (heavy investment — the leverage) | Disproportionate | Front-door spec authoring (Feature 1 `define`/`extend`), **low-friction insight capture (Feature 8)**, **govern the spec, not just the implementation (Feature 9)**, scope-discovery migration (Feature 3), the design surfaces of the fuller frontend (Feature 6). |
| **Industrialized execution** (necessary; the commodity end) | Make it cheap & automatic | **Parallel multi-backend execution engine (Feature 2)**, the `after_implement` governance that rides execution (Founding), audit-barrage migration (Feature 4). |

## What stack-control is

`stack-control` (CLI binary `stackctl`; brand: stackcontrol.org) is a new plugin that becomes the **control plane** for the spec-driven development lifecycle: it initiates and facilitates spec creation, negotiates the spec → implementation handoff, runs scope discovery and audit barrage over the work, and executes the plan — across a frontend **and** a CLI.

It is the realization of the `pluggable-lifecycle-providers` north star (see the feature `prd.md` § North Star): the provider-agnostic control plane that **governs** and **executes** any authoring provider's dependency-annotated plan, branching on capabilities, never on provider identity.

It governs not only *produced code* but the **design and ideation process itself**. Two consequences of that, both first-class to the protocol: (1) **low-friction insight capture** — design and scoping are NOT serial; the control plane must let an operator capture an out-of-sequence idea in one move, mid-thread, without losing the current thread, and triage it in a separate deliberate pass (operator: *"design should be as low friction as possible… treating design and scoping as a serial process is goofy"*); (2) **governing the spec, not just the implementation** — e.g. firing the cross-model audit-barrage over a spec at definition time, the same way governance fires over produced code at `after_implement`. The `design-inbox.md` in this feature's docs is the v0 dogfood of (1); both are explicit program features below.

## Why it is a separate plugin (and the successor to dw-lifecycle)

`stack-control` is the intended **successor to `dw-lifecycle`**. The plan is absorb-then-retire:

1. Build `stack-control` as a new plugin alongside `dw-lifecycle`.
2. Move the keepers from `dw-lifecycle` into it over successive features — scope-discovery, audit-barrage, session-start / session-end, and the founding governance extension itself.
3. When `stack-control` reaches parity with `dw-lifecycle` for real work, **retire `dw-lifecycle`**.

**Isolation rationale (operator):** `dw-lifecycle` is in active use doing real work. `stack-control` must be developed and published *without destabilizing it*. A separate plugin with its own version line gives that isolation — we can iterate and publish `stack-control` while `dw-lifecycle` keeps working.

## Where it lives

- **In this monorepo** — new workspace package(s) under `packages/` + a plugin shell under `plugins/stack-control/`, with its **own version line** separate from `dw-lifecycle`.
- **Why in-tree, not a separate repo:** the migration (moving scope-discovery, audit-barrage, session skills out of `dw-lifecycle`) is an in-tree code move. A separate repo would make that migration painful and split the dogfood. A spin-out to stackcontrol.org's own repo can happen *after* parity, when `stack-control` is a stable product — not mid-migration.
- **Naming convention:** product/plugin `stack-control`; CLI binary `stackctl` (the `kubectl` pattern — full word for branding, short verb for the CLI); skills namespaced `/stack-control:…`.
- **npm publish identity:** OPEN — `@stack-control/*` vs `@stackcontrol/*` vs `@deskwork/stack-control`. To decide.

## Feature sequence

Each feature is independently shippable. Order is the current intent; the operator owns resequencing.

Resequenced 2026-06-04 around the self-hosting strategy. Features 2–6 ("the rest") are built *through* the Feature 1 front door; their internal order is downstream and can be refined when we reach them.

| # | Feature | Scope | Status |
|---|---|---|---|
| Founding | **Governance as a Spec Kit `after_implement` extension** | The `deskwork-governance` extension that fires cross-model audit-barrage automatically after `/speckit-implement`, zero provider branching. | Built last session (`specs/001-speckit-backhalf-slice/`, source in the `dw-lifecycle` tree). **Rehomes as part of Feature 1.** |
| 1 | **stack-control front door — plugin + `stackctl` + native Spec Kit execution** | The self-hosting bootstrap, defined by a *capability* (not plumbing): stand up the plugin with minimal scaffolding folded in (`packages/stack-control/` + `plugins/stack-control/` shell, `plugin.json`, `stackctl` bin shim, own version line, marketplace registration), rehome the founding governance extension, and ship a *thin* control plane — **Claude Code skills (`/stack-control:…`) invoked in-session, over a `stackctl` CLI** (mirrors `dw-lifecycle`'s skills-over-CLI architecture; NOT a separate TUI/web app) — with two touch points: **curate a spec** (full edit/iterate/review) and **run it via the native Spec Kit mechanism** (`/speckit-implement` driven by the in-session agent, governance firing). Operator decision 2026-06-04 (option b): native Spec Kit execution is the literal first feature; no separate infra feature. **Used to build everything after.** | Speccing — spec clarification-clean (`specs/003-stack-control-front-door/`). |
| 2 | **Parallel multi-backend execution engine** | The differentiator: worktree-isolated, cross-backend fan-out across distinct coding agents, capability-selected (survives batch/headless CLI sunset). The current `specs/002-parallel-execution-engine/`. Built *through* the front door. | After 1 (spec drafted, paused). |
| 3 | **Migrate scope-discovery** into `stack-control` | Move the scope-discovery primitives + skills out of `dw-lifecycle`. | After 1. |
| 4 | **Migrate audit-barrage** into `stack-control` | Governance moves in-house; the execution → governance seam (one-way) survives the move. | After 1. |
| 5 | **Migrate session-start / session-end** | Session lifecycle skills move over. | After 1. |
| 6 | **Fuller control-plane frontend** | Beyond the thin front door: spec → implementation negotiation, scope-discovery + audit-barrage surfaces, the parallel engine's run surfaces. | After the capabilities exist. |
| 7 | **Parity → retire `dw-lifecycle`** | When `stack-control` does real work as well as `dw-lifecycle`, retire it. | Future. |
| 8 | **Low-friction insight capture** (governs the *design process*) | Make out-of-sequence idea capture a first-class control-plane capability: capture an insight in one move mid-thread without losing the current thread; **capture ≠ scope** (triage is a separate deliberate pass); support holding multiple design threads at once. Concretely: a `stackctl` capture verb + an inbox surface (frontend + CLI), with graduation paths into a spec / roadmap feature / GitHub issue, and integration with deskwork's Ideas stage for entries that become documents. | Captured 2026-06-06 (`design-inbox.md` is the v0 dogfood). Cross-cutting — sequence is the operator's call. |
| 9 | **Govern the spec, not just the implementation** | Fire the cross-model audit-barrage over a *spec* at definition time — a Spec Kit governance hook (`after_specify` / `after_clarify` / `after_plan`) mirroring the `after_implement` `deskwork-governance` extension, and/or folded into the front-door `define`/`extend` skills. | Captured 2026-06-06 (surfaced by manually barraging `specs/002`'s spec). Cross-cutting. |

## Two distinct pluggability axes (do not conflate)

`stack-control` has two independent ports. They get confused easily; keep them straight:

1. **Provider / plan-source port** — *where the plan comes from* (Spec Kit, Kiro, native, …). **Deferred.** The execution feature is built **concretely against Spec Kit's `tasks.md`**; provider generalization (a normalized manifest / provider port) comes later, derived from real instances rather than one imagined provider. (Operator decision 2026-06-04: build against one real provider first, generalize once it works.)
2. **Execution-backend port** — *how each task is run* (in-session sub-agent vs. batch CLI shell-out). **In scope now**, in the execution feature. Carries the durability constraint: the engine must not assume any vendor's batch/headless CLI mode is available (vendors may sunset it), so it selects and fails over among backends by declared capability, never by vendor identity.

## The durability constraint (why backend pluggability is non-negotiable)

AI-coding vendors may sunset batch/headless CLI usage (e.g. a vendor deprecating its headless print mode). An engine hardwired to one dispatch mechanism dies when that mechanism is withdrawn. So `stack-control` execution must run correctly when only in-session sub-agent dispatch is available, when only a batch CLI is available, and when both are — routing work to whatever backend declares the needed capability. This mirrors the constitution's Principle III (branch on capabilities, never identity), applied to execution backends rather than authoring providers.

## Open program-level decisions

- **npm publish scope / brand** (`@stack-control/*` vs `@stackcontrol/*` vs `@deskwork/stack-control`).
- Tactical, scoped to the execution feature (tracked in `specs/002-parallel-execution-engine/`): v1 backend roster, reconcile/merge policy, concurrency bound, task→backend assignment policy.

## Cross-references

- Feature north star: `prd.md` § North Star.
- Succession rule (treat as settled, don't relitigate): `.claude/rules/stack-control-succession.md`.
- Execution feature spec: `specs/002-parallel-execution-engine/spec.md`.
- Founding feature: `specs/001-speckit-backhalf-slice/`.
- Top-level roadmap pointer: `ROADMAP.md` § Pluggable lifecycle providers.
