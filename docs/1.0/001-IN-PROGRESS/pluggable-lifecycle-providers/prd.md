---
slug: pluggable-lifecycle-providers
title: pluggable-lifecycle-providers
targetVersion: "1.0"
date: 2026-06-04
parentIssue:
deskwork:
  id: e246b4b1-cd4d-486c-b714-65949263c04e
---

# PRD: pluggable-lifecycle-providers → **stack-control**

> **Reframed 2026-06-04 (integration-first pivot + stack-control decisions).** This feature is being realized as a new plugin, **`stack-control`** (CLI `stackctl`), built as the successor to `dw-lifecycle`. The program-level vision, feature sequence, and settled decisions live in **[`stack-control-roadmap.md`](./stack-control-roadmap.md)** (the single source of truth for the sequence) and **`.claude/rules/stack-control-succession.md`**. Per-feature implementation detail lives in the Spec Kit specs under `specs/`. This PRD owns the **problem framing, the solution thesis, and the cross-cutting scope decisions**; it no longer carries a manifest-first phase plan (that approach was superseded by the integration-first pivot — see below).
>
> The earlier manifest/port/reconcile technical design in [`design.md`](./design.md) is **superseded as the spine** and now describes the *future substrate feature*, not the current path.

## North Star — the audacious ideal (do not lose sight of this)

This is the end-state every feature ladders toward. Incremental delivery is the *path*; this is the *destination*.

> **`stack-control` is the provider-agnostic control plane that takes ANY authoring provider's dependency-annotated plan and — branching only on capabilities, never on provider identity — does two things the providers' own tools do not:**
>
> 1. **Governs it.** Cross-model audit-barrage, the finding state machine (`open → fixed → verified`), and scope/clone/debt governance run over the plan and the work it produces — regardless of who authored it.
> 2. **Executes it better than the provider's own single-agent grinder.** A parallel, multi-backend, worktree-isolated execution engine drops *tranches of independent tasks* (read from the provider's dependency map) onto **multiple distinct coding backends concurrently** — in-session sub-agents and batch CLIs alike — each task in its own git worktree, then reconciles.

Around that core, `stack-control` is a full **control plane** spanning the lifecycle: it initiates and facilitates spec creation, negotiates the spec → implementation handoff, runs scope discovery and audit barrage, and executes — surfaced through both a **frontend** and the `stackctl` **CLI**.

Division of labor at the ideal: the **provider** authors intent *and the dependency map*; **stack-control** owns physical substrate, **parallel multi-backend execution**, and **governance**. The provider's single-agent execution loop becomes one *option* — stack-control can run the plan faster and audit it harder than the provider can alone.

**Why this is the ideal and not scope creep:** the front-half (authoring) is commodity; the differentiated value is what stack-control does *on top of* any plan. Governance was the original differentiator; the Spec-Kit dogfood (2026-06-04) surfaced a second, larger one — parallel multi-backend execution — and prior-art study (MAQA, Fleet) confirmed **nobody else does cross-backend execution** (they parallelize via one model's sub-agents). Capturing it here keeps the incremental features honest; scoping *which* feature ships *when* is a separate, explicit, operator-driven decision (tracked in the roadmap).

## Why a new plugin (stack-control), and why the successor to dw-lifecycle

`stack-control` is built as a **new plugin in this monorepo**, with its own version line, as the **successor to `dw-lifecycle`** via absorb-then-retire: it absorbs the keepers (scope-discovery, audit-barrage, session-start/session-end, and the founding governance extension) over successive features, and `dw-lifecycle` is retired once `stack-control` reaches parity for real work. **Isolation is the point** — `dw-lifecycle` is in active use doing real work, so `stack-control` must be developed and published without destabilizing it. Full rationale + sequence in [`stack-control-roadmap.md`](./stack-control-roadmap.md).

## Problem Statement

The front half of `dw-lifecycle` (define → setup → issues) is now commodity. Spec-driven tools — GitHub Spec Kit, AWS Kiro, and others arriving on a recurring cadence — author feature decompositions at least as well as the native `superpowers:writing-plans` flow, several with more formal acceptance-criteria notation (Kiro's EARS). The operator wants a single control plane while treating authoring as a swappable layer, so the differentiated back half (audit barrage, finding state machine, scope/clone/debt governance) sits on top of whatever authored the plan — and, beyond governing, can **execute** that plan better than the provider's own single-agent loop.

A structural blocker shaped the original (manifest-first) design: `workplan.md` served two roles at once — the **authored plan** (intellectual decomposition) and the **execution ledger** (mutable surface `implement` walks). Providers have the first; they have no notion of the second. That impedance mismatch is real and still informs the eventual provider abstraction — but the 2026-06-04 dogfood showed the abstraction should be *derived from a real integration*, not designed up front.

Who hurts today: the operator, every time a new authoring tool ships and integration means forking the front half or hand-reconciling two plans. And the back half, coupled — via the workplan's shape — to the assumption that deskwork authored the plan.

## Solution

Build `stack-control` **integration-first**: adopt a real provider (Spec Kit) as the management layer and let the bridge's shape emerge from concrete integration, rather than designing the manifest/port abstraction up front (which risks building the wrong shape). Two differentiators sit on top of any plan:

- **Governance** — packaged so it fires automatically over a provider's native flow (proved by the founding feature: a Spec Kit `after_implement` extension running cross-model audit-barrage, zero provider branching).
- **Execution** — two selectable modes over the same plan source: (1) **native Spec Kit execution with extensions** (drive `/speckit-implement` with the governance hooks firing), and (2) the **parallel multi-backend engine** (worktree-isolated cross-backend fan-out). The execution-backend port is pluggable by declared capability — it must not assume any vendor's batch/headless CLI mode is available, since vendors may sunset it.

The **provider abstraction** (a normalized manifest as the port, `normalize()`/`reconcile()`, tracker capability) is **deferred to a later "substrate" feature**, to be derived once concrete integration has proved the shape — not designed from one imagined provider. The provider artifact stays authoritative for *intent*; stack-control's own substrate is authoritative for *progress + governance*.

## Two pluggability axes — keep them straight

1. **Provider / plan-source port** — *where the plan comes from*. **Deferred.** Features are built concretely against Spec Kit's `tasks.md`; provider generalization comes in the substrate feature.
2. **Execution-backend port** — *how each task is run* (in-session sub-agent vs. batch CLI). **In scope now**, in the execution feature. Carries the durability constraint (capability-based selection, survives batch/headless CLI sunset).

## Feature sequence

The current feature sequence (founding governance extension → execution → dw-lifecycle migrations → control-plane frontend → retire dw-lifecycle, with the manifest/substrate sequenced after the slices prove the shape) is maintained as the single source of truth in **[`stack-control-roadmap.md`](./stack-control-roadmap.md) § Feature sequence**. It is **PROVISIONAL** pending the active resequence pass. This PRD does not duplicate the table (drift-avoidance).

## Acceptance Criteria

Per-feature acceptance criteria live in each Spec Kit spec under `specs/` (the founding feature's are recorded in `specs/001-speckit-backhalf-slice/`; the execution feature's success criteria in `specs/002-parallel-execution-engine/spec.md`). The **cross-cutting, program-level** criteria that hold across features:

- [ ] The differentiated back half (governance, finding state machine, scope/clone/debt) contains **zero branches on provider identity** — only on declared capabilities. (grep gate.)
- [ ] The execution engine contains **zero branches on a vendor/tool identity** in backend selection — capability-only; and a plan runs to completion with only the in-session backend OR only a batch CLI available (no hard dependency on batch/headless CLI).
- [ ] Governance composes with a provider's native flow automatically (no manual barrage invocation) and over a one-way execution → governance seam.
- [ ] `stack-control` is developed and published without destabilizing `dw-lifecycle` (isolation invariant held throughout the migration).

## Out of Scope

> Operator decisions recorded, not pre-emptive cuts. Items are deliberate non-goals; revive via discussion if needed.

- **The manifest/port/reconcile substrate is DEFERRED, not rejected** — it is a later feature, sequenced after concrete integration proves the shape. (This is the one item that moved from "the plan" to "later" in the pivot.)
- **Bidirectional sync / live mirroring** between any normalized state and a provider artifact. The relationship is one-way with explicit re-sync.
- **Writing stack-control governance state back into provider artifacts** — the provider would stomp it on the next author pass.
- **A new spec/intent format** — the provider artifact stays the intent source-of-truth.
- **Live-driver integration for Kiro** — realistically an importer when that arrives.
- **Non-GitHub trackers** (Jira/Linear/etc.) — shaped to allow later; no adapter now.
- **A separate repo / spin-out for stack-control** — in-monorepo until parity (the migration is an in-tree move); spin-out can follow parity.

## How this PRD evolves

This PRD is **edited in place** as the program evolves (operator decision 2026-06-04). The feature is now **Spec-Kit-managed** — per-feature specs flow through Spec Kit's native sequence (`constitution → specify → clarify → plan → tasks → implement`); the deskwork `/deskwork:iterate` review loop no longer gates edits to this document. The PRD remains a deskwork-ingested entry (frontmatter `deskwork.id` preserved) for calendar/history purposes, but its authority is now "current operator-approved framing," updated directly.

**Status note (2026-06-04):** the overall plan is under an active **resequence-then-realign revision pass**. This PRD has been realigned to the stack-control architecture; the *feature order* may still shift (see the roadmap's revision note).
