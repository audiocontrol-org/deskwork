---
slug: pluggable-lifecycle-providers
title: pluggable-lifecycle-providers
targetVersion: "1.0"
date: 2026-06-04
parentIssue: 
deskwork:
  id: e246b4b1-cd4d-486c-b714-65949263c04e
---

# PRD: pluggable-lifecycle-providers

## Problem Statement

The front half of `dw-lifecycle` (define → setup → issues) is now commodity. Spec-driven tools — GitHub Spec Kit, AWS Kiro, and others arriving on a ~6-month cadence — author feature decompositions at least as well as the native `superpowers:writing-plans` flow, several with more formal acceptance-criteria notation (Kiro's EARS). The operator wants to keep `deskwork` as the single control plane while treating authoring as a swappable layer, so the differentiated back half (audit barrage, finding state machine, scope/clone/debt governance) sits on top of whatever authored the plan. The blocker is an impedance mismatch: `workplan.md` currently serves two roles at once — the **authored plan** (intellectual decomposition) and the **execution ledger** (mutable surface `implement` walks, `promote-findings` inserts into, the finding state machine annotates). Providers have a notion of the first; they have no notion of the second. Running native plan-writing *alongside* a provider's `tasks.md` yields two independent decompositions with no authority answer. Adopting the provider's file *as* the ledger either pollutes it with deskwork frontmatter (stomped on next author pass) or couples the back half to each provider's task-ID scheme. Who hurts today: the operator, every time a new authoring tool ships and integration means either forking the front half or hand-reconciling two plans. And the back half, which is coupled — via the workplan's shape — to the assumption that deskwork authored the plan.

## Solution

`deskwork` remains the one control plane. Authoring is selected per feature via a **provider** (`native`, `spec-kit`, `kiro`, future). A normalized **lifecycle manifest** is the de-impedance layer; the back half reads it and never learns which provider ran. Adding a provider in six months costs one adapter implementing `normalize()` at minimum, with `capabilities()` letting deskwork fill the rest. The provider artifact is authoritative for *intent*; the manifest is authoritative for *progress + governance* — the split that dissolves the mismatch. Net: shed maintenance of hand-rolled spec authoring; keep the differentiators untouched on a plan whose origin they no longer care about.

## Acceptance Criteria

- [ ] The back half (`implement`, `audit-barrage`, `promote-findings`, `re-audit-fixed-findings`, `scope-inventory`, `ship`, `complete`, `session-*`) contains zero branches on provider identity — only on `capabilities`. (grep gate.)
- [ ] With `provider: native`, the full lifecycle produces byte-identical user-visible behavior to pre-feature `dw-lifecycle` (the Phase 1–2 neutrality guarantee).
- [ ] With `provider: spec-kit`, `specify`'s `tasks.md` projects into a schema-valid manifest; `implement` walks it; a task-boundary `audit-barrage` fires unchanged.
- [ ] A re-sync after upstream task edits preserves `status`/`sha`/`governance` on unchanged tasks, flags drifted/orphaned, and leaves every `origin: deskwork` task untouched. (Verified by a reconcile test with an attached finding.)
- [ ] `tracker: none` makes `issues` a no-op and routes `pickup`/`complete`/`debt-report` to manifest+journal state with no `gh` calls.
- [ ] A provider-version mismatch between `provenance` and `.dw-lifecycle/config.json` is reported by `doctor`.
- [ ] Adding a stub future provider that implements only `normalize()` yields a runnable lifecycle (deskwork fills substrate, tracking, governance via capabilities).

## Out of Scope

- [Capability or change that is explicitly NOT part of this feature]

## Technical Approach

Ports-and-adapters with the manifest as the port. `normalize()` is per-provider and translates strictly *into* the manifest (one-way, pure projection, no merge). `reconcile()` is deskwork core operating only on `(current, candidate)` manifests, matching by `provider_task_id` — providers never touch it. Tasks come from the provider 1:1 (deskwork never re-decomposes); phases become a thin grouping overlay whose existence is driven by the tracker capability, which ties the granularity decision to the issue decision (the same decision). Re-sync re-projects into a candidate and reconciles via propose-then-apply, with deskwork-origin tasks (no `provider_task_id`) carried through untouched — the guarantee that a provider re-author can't clobber finding state. Full architecture, schema, and the `normalize()`/`reconcile()` contracts in `design.md`.
