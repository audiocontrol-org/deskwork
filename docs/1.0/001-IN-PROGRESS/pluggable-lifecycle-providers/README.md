---
slug: pluggable-lifecycle-providers
targetVersion: "1.0"
date: 2026-06-04
branch: feature/pluggable-lifecycle-providers
parentIssue: 
---

# Feature: pluggable-lifecycle-providers → **stack-control**

Build **`stack-control`** (CLI `stackctl`) — a new plugin, the **successor to `dw-lifecycle`** — as the provider-agnostic **control plane** that takes ANY authoring provider's dependency-annotated plan and both **governs it** (cross-model audit-barrage, finding state machine, scope/clone/debt) and **executes it** (two modes: native Spec-Kit-with-extensions, and a parallel multi-backend worktree-isolated engine), branching only on capabilities, never on provider identity. Built **integration-first** (concretely against Spec Kit; the provider abstraction is deferred to a later substrate feature).

> **North Star (ideal end-state):** `stack-control` as the control plane that governs AND executes any provider's plan better than the provider's own single-agent grinder — a parallel, multi-**backend**, worktree-isolated engine (in-session sub-agents + batch CLIs, selected by capability so it survives any vendor sunsetting batch/headless CLI mode). See [`prd.md`](./prd.md) § North Star and [`stack-control-roadmap.md`](./stack-control-roadmap.md).

## Status

**Pivoted 2026-06-04 → integration-first, and reframed as the `stack-control` plugin.** Rather than building the manifest/port abstraction up front, we adopted Spec Kit as a real management layer and let the bridge's shape emerge from concrete integration. The work is being built as `stack-control`, a new in-monorepo plugin that succeeds `dw-lifecycle` via absorb-then-retire (isolation so `dw-lifecycle` keeps doing real work undisturbed).

**Resequenced 2026-06-04 (self-hosting) then again 2026-06-06 (design-phase first).** The foundational docs were realigned to the stack-control architecture; the control plane is built first, then used to build the rest, with the up-front **design surfaces pulled ahead of the execution engine**. Features are named by **`<phase>/<slug>` codename** (not `F<n>` — the numbers no longer imply order). The **canonical sequence (with scope + status) lives in [`stack-control-roadmap.md`](./stack-control-roadmap.md) § Feature sequence** — this README does not duplicate it (drift-avoidance). In short:

1. **`multi/front-door` — COMPLETE** (35/35, governed, pushed; `plugins/stack-control/` live). The thin control plane that can **curate a spec** and **run it via native Spec Kit execution** (`/speckit-implement`, governance firing); the founding governance extension (`impl/governance`) rehomed here. The self-hosting bootstrap — used to build everything after.
2. **Design-phase block (next), built *through* the front door** — `design/insight-capture` → `design/spec-governance` → `multi/control-plane-frontend` design surfaces.
3. **Then** `impl/execution-engine` (parallel multi-backend engine, `specs/002-parallel-execution-engine/`; spec hardened, parked at plan) → the `dw-lifecycle` migrations → `multi/retire-dw-lifecycle` at parity. (Substrate / provider abstraction deferred until a 2nd provider arrives.)

## Key Links

- Program roadmap (canonical): [`stack-control-roadmap.md`](./stack-control-roadmap.md)
- Settled decisions (don't relitigate): `.claude/rules/stack-control-succession.md`
- PRD (problem / solution / scope): [`prd.md`](./prd.md)
- Founding feature spec: `specs/001-speckit-backhalf-slice/`
- Execution feature spec: `specs/002-parallel-execution-engine/spec.md`
- Superseded (history): [`design.md`](./design.md) (manifest-first, now the future substrate's design), [`workplan.md`](./workplan.md) (retired), [`feature-definition.md`](./feature-definition.md) (original interview)
- Branch: `feature/pluggable-lifecycle-providers`
