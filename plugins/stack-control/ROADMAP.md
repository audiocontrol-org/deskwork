---
doc-grammar: roadmap
---

# stack-control — roadmap

The governed, plugin-local **dependency graph** of stack-control's features — the
program's sequencing brain a fresh agent reads to act correctly without
re-explanation. Each item is a heading-keyed Unit identified by its
`<phase>:<kind>/<slug>` identifier; items are **peers**, ordered by the `phase`
relation `[design, plan, impl, multi]` (NOT alphabetical) and tie-broken by
identifier. Statuses: `planned`, `in-flight`, and the terminal `shipped` /
`cancelled` / `retired`.

First-class **typed edges** drive the protocol: `depends-on` (hard, acyclic;
satisfied only when the target is `shipped`), `part-of` (non-blocking grouping),
`deferred-until` (a prose condition that blocks readiness until the operator
clears it). Reason over the graph with `/stack-control:roadmap` (`next` /
`blocked` / `blocks` / `order` / `graph` / `reconcile`) and keep it crisp with
`add` / `advance` / `decompose` / `reclassify` / `defer`. Program vision +
rationale live in
`docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md`;
this document is the live feature queue.

## design:feature/document-primitives
- status: in-flight
- depends-on: multi:feature/front-door
- spec: specs/005-document-primitives
Generalized archive / unarchive / curate over self-describing governed documents — the engine this roadmap protocol is built on.

## design:feature/insight-capture
- status: planned
- depends-on: multi:feature/front-door
One-move out-of-sequence insight capture as a first-class control-plane capability; capture ≠ scope. Retires the interim design-inbox convention.

## design:feature/migrate-scope-discovery
- status: planned
- depends-on: multi:feature/front-door
Move scope-discovery primitives + skills in-house with per-codebase clone detection; vendor the full clone-detector.

## design:feature/roadmap-protocol
- status: in-flight
- depends-on: design:feature/document-primitives
- spec: specs/006-roadmap-protocol
Keep the roadmap live, crisp, and up-to-date: a DAG of heading-keyed work items with first-class typed edges. This feature (the manual self-seed).

## design:feature/spec-authoring
- status: planned
- depends-on: multi:feature/front-door
Author specs at promise altitude — the prevention half of spec quality, sibling to spec-governance's detection.

## design:feature/spec-governance
- status: in-flight
- depends-on: multi:feature/front-door
- spec: specs/004-spec-governance
Govern the spec, not just the implementation: cross-model audit-barrage over a spec at definition time. The mode-aware lens shipped.

## design:gap/roadmap-order-gating
- status: planned
- part-of: design:feature/roadmap-protocol
- depends-on: design:feature/roadmap-protocol
The deferred hard out-of-order GATING (006 FR-018): refuse work on an item whose dependencies are not yet shipped. Captured here so the deferral is a tracked roadmap item, never silently dropped.

## impl:feature/execution-engine
- status: planned
- depends-on: multi:feature/front-door
- spec: specs/002-parallel-execution-engine
The differentiator: worktree-isolated, capability-selected, cross-backend parallel fan-out. Spec hardened + parked at /speckit-plan.

## impl:feature/governance
- status: shipped
- part-of: multi:feature/front-door
- spec: specs/001-speckit-backhalf-slice
Governance as a Spec Kit after_implement extension: the deskwork-governance cross-model audit-barrage hook. Rehomed into the front door.

## multi:feature/control-plane-frontend
- status: planned
- depends-on: multi:feature/front-door, impl:feature/execution-engine
Fuller control-plane frontend: spec→implementation negotiation, scope/barrage surfaces, engine-run surfaces. Design surfaces lead; engine-run surfaces follow the engine.

## multi:feature/front-door
- status: shipped
- spec: specs/003-stack-control-front-door
The self-hosting bootstrap: plugin + stackctl + native Spec Kit execution. The thin control plane everything after is built through.

## multi:feature/migrate-audit-barrage
- status: planned
- depends-on: multi:feature/front-door
Migrate audit-barrage + the audit protocol (convergence criterion + finding state machine) in-house; the one-way execution→governance seam survives.

## multi:feature/migrate-session-skills
- status: planned
- depends-on: multi:feature/front-door
Migrate session-start / session-end lifecycle skills into stack-control.

## multi:feature/retire-dw-lifecycle
- status: planned
- depends-on: design:feature/migrate-scope-discovery, multi:feature/migrate-audit-barrage, multi:feature/migrate-session-skills
Reach parity, then retire the predecessor — the absorb-then-retire endgame.

## design:gap/roadmap-edge-aware-archival
- status: planned
- depends-on: design:feature/roadmap-protocol
- part-of: design:feature/roadmap-protocol
- ref: #436
curate/archive would archive a shipped item still referenced by a depends-on edge and dangle it; roadmap archival must be edge-aware (skip terminal items that are still depends-on/part-of targets).

