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

**Overall plan is under an active resequence-then-realign revision pass (2026-06-04).** The foundational docs have been realigned to the stack-control architecture (this pass); the *feature order* may still shift. The canonical program + sequence lives in [`stack-control-roadmap.md`](./stack-control-roadmap.md) (the table there is the single source of truth and is marked PROVISIONAL).

### Feature sequence (provisional — canonical copy in the roadmap)

| Feature | Description | Status |
|---|---|---|
| Founding | Governance as a Spec Kit `after_implement` extension (govern a foreign plan) | ✅ Built — fires automatically, cross-model, caught real self-bugs. `specs/001-speckit-backhalf-slice/`. Rehomes into stack-control. |
| Execution | Two modes: native Spec-Kit-with-extensions **+** parallel multi-backend engine | 🚧 Speccing — `specs/002-parallel-execution-engine/` (spec body paused mid-revision) |
| Migrations | Move scope-discovery → audit-barrage → session-start/end out of `dw-lifecycle` | Future |
| Control-plane frontend | Spec creation, spec→impl negotiation, scope-discovery + audit-barrage surfaces | Future |
| Retire `dw-lifecycle` | At parity | Future |
| Substrate | Manifest / provider port / `reconcile()` / tracker (the deferred provider abstraction) | Deferred — sequence after the slices prove the shape |

## Key Links

- Program roadmap (canonical): [`stack-control-roadmap.md`](./stack-control-roadmap.md)
- Settled decisions (don't relitigate): `.claude/rules/stack-control-succession.md`
- PRD (problem / solution / scope): [`prd.md`](./prd.md)
- Founding feature spec: `specs/001-speckit-backhalf-slice/`
- Execution feature spec: `specs/002-parallel-execution-engine/spec.md`
- Superseded (history): [`design.md`](./design.md) (manifest-first, now the future substrate's design), [`workplan.md`](./workplan.md) (retired), [`feature-definition.md`](./feature-definition.md) (original interview)
- Branch: `feature/pluggable-lifecycle-providers`
