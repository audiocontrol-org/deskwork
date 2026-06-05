# stack-control — program roadmap

> **Status:** program-level capture (operator decisions, 2026-06-04 session). This document holds the *program* vision for `stack-control`; individual features have their own Spec Kit specs under `specs/`. No dates — milestones, not deadlines.

> **⚠ Revision pass in progress (2026-06-04).** After the exploratory slice-001 implementation and this session's architectural decisions, the operator called for revising the overall plan. Agreed approach: **(b) resequence the feature order first** (is execution really next, or do the dw-lifecycle migrations / the control-plane frontend come first?), **then (a) realign the stale manifest-first docs** (`workplan.md`, `design.md`, `prd.md`, `README.md`, and a Spec Kit `constitution.md` amendment) to the corrected sequence. The **002 execution spec is PAUSED** until the sequence is settled (the resequence determines whether 002 is even the next feature to finish). The **Feature sequence** table below is therefore **PROVISIONAL** pending this pass.

## What stack-control is

`stack-control` (CLI binary `stackctl`; brand: stackcontrol.org) is a new plugin that becomes the **control plane** for the spec-driven development lifecycle: it initiates and facilitates spec creation, negotiates the spec → implementation handoff, runs scope discovery and audit barrage over the work, and executes the plan — across a frontend **and** a CLI.

It is the realization of the `pluggable-lifecycle-providers` north star (see the feature `prd.md` § North Star): the provider-agnostic control plane that **governs** and **executes** any authoring provider's dependency-annotated plan, branching on capabilities, never on provider identity.

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

| # | Feature | Scope | Status |
|---|---|---|---|
| Founding | **Governance as a Spec Kit `after_implement` extension** | The `deskwork-governance` extension that fires deskwork's cross-model audit-barrage automatically after `/speckit-implement`, cross-model, zero provider branching. | Built last session (`specs/001-speckit-backhalf-slice/`, source currently in the `dw-lifecycle` tree). Rehomes into `stack-control`. |
| 1 | **Execution** | Two selectable modes over the same plan source: (a) **native Spec Kit execution with extensions** — drive `/speckit-implement` with the extension hooks (governance) firing; (b) **parallel multi-backend engine** — worktree-isolated, cross-backend fan-out (the differentiator). Both governed. Drivable by both `stackctl` and the future control-plane frontend. | Speccing now (`specs/002-parallel-execution-engine/`). |
| 2 | **Migrate scope-discovery** into `stack-control` | Move the scope-discovery primitives + skills out of `dw-lifecycle`. | Future. |
| 3 | **Migrate audit-barrage** into `stack-control` | Governance moves in-house; the execution → governance seam (one-way) survives the move. | Future. |
| 4 | **Migrate session-start / session-end** | Session lifecycle skills move over. | Future. |
| 5 | **Control-plane frontend** | The UI surface: spec-creation, spec → implementation negotiation, and scope-discovery + audit-barrage surfaces. Pairs with the `stackctl` CLI over shared interface artifacts (run records, handoffs). | Future. |
| 6 | **Parity → retire `dw-lifecycle`** | When `stack-control` does real work as well as `dw-lifecycle`, retire `dw-lifecycle`. | Future. |

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
