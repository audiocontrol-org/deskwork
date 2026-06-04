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

> **Canonical technical detail lives in [`design.md`](./design.md)** — architecture, manifest schema, `normalize()` / `reconcile()` contracts, provider port, tracker capability, and the full phasing rationale. The PRD captures problem framing, operator-facing acceptance criteria, scope decisions, and the open questions the operator dispositions during deskwork review.

## Problem Statement

The front half of `dw-lifecycle` (define → setup → issues) is now commodity. Spec-driven tools — GitHub Spec Kit, AWS Kiro, and others arriving on a ~6-month cadence — author feature decompositions at least as well as the native `superpowers:writing-plans` flow, several with more formal acceptance-criteria notation (Kiro's EARS). The operator wants to keep `deskwork` as the single control plane while treating authoring as a swappable layer, so the differentiated back half (audit barrage, finding state machine, scope/clone/debt governance) sits on top of whatever authored the plan.

The blocker is an impedance mismatch: `workplan.md` currently serves two roles at once — the **authored plan** (intellectual decomposition) and the **execution ledger** (mutable surface `implement` walks, `promote-findings` inserts into, the finding state machine annotates). Providers have a notion of the first; they have no notion of the second. Running native plan-writing *alongside* a provider's `tasks.md` yields two independent decompositions with no authority answer. Adopting the provider's file *as* the ledger either pollutes it with deskwork frontmatter (stomped on next author pass) or couples the back half to each provider's task-ID scheme.

Who hurts today: the operator, every time a new authoring tool ships and integration means either forking the front half or hand-reconciling two plans. And the back half, which is coupled — via the workplan's shape — to the assumption that deskwork authored the plan.

## Solution

`deskwork` remains the one control plane. Authoring is selected per feature via a **provider** (`native`, `spec-kit`, `kiro`, future). A normalized **lifecycle manifest** is the de-impedance layer; the back half reads it and never learns which provider ran. Adding a provider in six months costs one adapter implementing `normalize()` at minimum, with `capabilities()` letting deskwork fill the rest. The provider artifact is authoritative for *intent*; the manifest is authoritative for *progress + governance* — the split that dissolves the mismatch. Net: shed maintenance of hand-rolled spec authoring; keep the differentiators untouched on a plan whose origin they no longer care about.

## Technical Approach (summary)

Ports-and-adapters with the manifest as the port. `normalize()` is per-provider and translates strictly *into* the manifest (one-way, pure projection, no merge). `reconcile()` is deskwork core operating only on `(current, candidate)` manifests, matching by `provider_task_id` — providers never touch it. Tasks come from the provider 1:1 (deskwork never re-decomposes); phases become a thin grouping overlay whose existence is driven by the tracker capability, which ties the granularity decision to the issue decision (the same decision). Re-sync re-projects into a candidate and reconciles via propose-then-apply, with deskwork-origin tasks (no `provider_task_id`) carried through untouched — the guarantee that a provider re-author can't clobber finding state.

**Full architecture, schema, `normalize()`/`reconcile()` contracts, capability negotiation, and division-of-labor diagram in [`design.md`](./design.md).** The PRD does not reproduce that material — the design doc is canonical.

## Phase ordering (subject to operator confirmation via review iteration)

The 7 implementation phases from `design.md` § 8 — each ships **behavior-neutral until the next** (no operator-visible regression at any phase boundary).

| # | Phase | Behavior-neutrality | Depends on |
|---|---|---|---|
| 1 | Extract the manifest (schema + validator; back half reads it; `native` emits) | Zero behavior change visible — load-bearing refactor | — |
| 2 | Provider port + `native` adapter (route `define`/`setup` through port) | Identical behavior; seam exists, not yet exercised | Phase 1 |
| 3 | `reconcile()` core + propose-then-apply report + re-sync command | New capability; behavior-additive | Phase 1, 2 |
| 4 | `spec-kit` adapter + `--provider` flag + `install`-time detection | Second provider operational | Phase 2, 3 |
| 5 | `kiro` importer + `structured_criteria: ears` capability gate | Third provider; `ship` upgrade earns Kiro's keep | Phase 2 |
| 6 | Tracker capability (`none` default) + four `gh`-skill gates | Default flips to `none`; back-compat for existing features | Phase 1 |
| 7 | Customization polish: project-local adapter override seam + provider-version doctor rule | Round trip closes | Phase 2, 6 |

**Operator review question:** confirm this ordering, or flag any phase that should move earlier/later for risk minimization.

## Open questions (Phase 1 review iteration dispositions)

The disposition column is the agent's first-pass leaning per design.md § 8; operator confirms or overrides via margin notes.

| OQ | Summary | Design's leaning | Operator disposition |
|---|---|---|---|
| OQ-1 | Does `scope-inventory` tolerate a single synthetic phase, or should it key evidence on tasks rather than phases? | Re-key onto tasks if synthetic-phase tolerance is fragile | TBD |
| OQ-2 | Kiro importer trigger ergonomics — explicit `--import-from` vs watched path? | Explicit `--import-from` (importer-tier, not driver-tier) | TBD |
| OQ-3 | Material-change detection for `drifted` in re-sync — normalized-text equality vs similarity threshold? | Start with normalized-exact; revisit if over-flags | TBD |
| OQ-4 | Should `provenance.capabilities` be re-snapshotted on every reconcile or frozen at first projection? | Re-snapshot — provider upgrade that adds EARS upgrades the gate | TBD |

**Operator review question:** confirm each disposition, or overturn with margin notes. Phase 2+ implementation depends on these resolutions.

## Acceptance Criteria

- [ ] The back half (`implement`, `audit-barrage`, `promote-findings`, `re-audit-fixed-findings`, `scope-inventory`, `ship`, `complete`, `session-*`) contains zero branches on provider identity — only on `capabilities`. (grep gate.)
- [ ] With `provider: native`, the full lifecycle produces byte-identical user-visible behavior to pre-feature `dw-lifecycle` (the Phase 1–2 neutrality guarantee).
- [ ] With `provider: spec-kit`, `specify`'s `tasks.md` projects into a schema-valid manifest; `implement` walks it; a task-boundary `audit-barrage` fires unchanged.
- [ ] A re-sync after upstream task edits preserves `status`/`sha`/`governance` on unchanged tasks, flags drifted/orphaned, and leaves every `origin: deskwork` task untouched. (Verified by a reconcile test with an attached finding.)
- [ ] `tracker: none` makes `issues` a no-op and routes `pickup`/`complete`/`debt-report` to manifest+journal state with no `gh` calls.
- [ ] A provider-version mismatch between `provenance` and `.dw-lifecycle/config.json` is reported by `doctor`.
- [ ] Adding a stub future provider that implements only `normalize()` yields a runnable lifecycle (deskwork fills substrate, tracking, governance via capabilities).

## Out of Scope

> Per the feature-definition: operator decisions recorded, not pre-emptive cuts. Each item is a deliberate non-goal the operator should confirm or revive via margin notes during PRD review.

- **Bidirectional sync / live mirroring** between manifest and provider artifact. Explicitly rejected; the relationship is one-way with explicit re-sync.
- **Writing deskwork governance state back into provider artifacts.** The provider would stomp it on the next author pass.
- **A new spec/intent format.** The provider artifact stays the intent source-of-truth.
- **Live-driver integration for Kiro.** It owns its own IDE/branch/worktree state; realistically an importer this cycle.
- **`github-lazy` tracker mode.** Named as a future option; not built in v1.
- **Non-GitHub trackers** (Jira/Linear/etc.). The tracker capability is shaped to allow them later; no adapter now.

## How this PRD evolves

This is a deskwork-managed PRD. The workplan's Phase 1 walks the standard iteration loop:

1. Operator opens the studio review surface.
2. Operator leaves margin notes on the phase-ordering table, OQ dispositions, Acceptance Criteria, or Out-of-Scope list.
3. Operator requests iteration.
4. Agent runs `/deskwork:iterate` to address comments, snapshot the new revision, and report.
5. Cycle until operator clicks Approve and the workflow state becomes `applied`.

Per the strict per-CLAUDE.md gate: **no Phase 2 (implementation) work begins until the PRD's deskwork workflow state is `applied`.** This feature does not get an exception.
