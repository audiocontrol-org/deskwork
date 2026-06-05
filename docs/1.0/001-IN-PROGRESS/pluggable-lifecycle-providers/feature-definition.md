# Feature Definition: Pluggable Lifecycle Providers

> Capture artifact (capture mode). Records the full known + knowably-implied
> problem space. Scoping into v1 phases is a separate operator-driven pass in
> `setup`/`issues`; cuts recorded there are operator decisions, not pre-emptive
> narrowing here.

> **Historical (point-in-time, 2026-06-04).** This is the original definition interview. The program has since pivoted integration-first and is being realized as the `stack-control` plugin. For the current vision + framing, see [`stack-control-roadmap.md`](./stack-control-roadmap.md) and [`prd.md`](./prd.md).

## Problem

The front half of `dw-lifecycle` (define → setup → issues) is now commodity. Spec-driven tools — GitHub Spec Kit, AWS Kiro, and others arriving on a ~6-month cadence — author feature decompositions at least as well as the native `superpowers:writing-plans` flow, several with more formal acceptance-criteria notation (Kiro's EARS). The operator wants to keep `deskwork` as the single control plane while treating authoring as a swappable layer, so the differentiated back half (audit barrage, finding state machine, scope/clone/debt governance) sits on top of whatever authored the plan.

The blocker is an impedance mismatch: `workplan.md` currently serves two roles at once — the **authored plan** (intellectual decomposition) and the **execution ledger** (mutable surface `implement` walks, `promote-findings` inserts into, the finding state machine annotates). Providers have a notion of the first; they have no notion of the second. Running native plan-writing *alongside* a provider's `tasks.md` yields two independent decompositions with no authority answer. Adopting the provider's file *as* the ledger either pollutes it with deskwork frontmatter (stomped on next author pass) or couples the back half to each provider's task-ID scheme.

Who hurts today: the operator, every time a new authoring tool ships and integration means either forking the front half or hand-reconciling two plans. And the back half, which is coupled — via the workplan's shape — to the assumption that deskwork authored the plan.

## Goal

`deskwork` remains the one control plane. Authoring is selected per feature via a **provider** (`native`, `spec-kit`, `kiro`, future). A normalized **lifecycle manifest** is the de-impedance layer; the back half reads it and never learns which provider ran. Adding a provider in six months costs one adapter implementing `normalize()` at minimum, with `capabilities()` letting deskwork fill the rest. The provider artifact is authoritative for *intent*; the manifest is authoritative for *progress + governance* — the split that dissolves the mismatch. Net: shed maintenance of hand-rolled spec authoring; keep the differentiators untouched on a plan whose origin they no longer care about.

## Scope

**In:**
- A versioned `lifecycle-manifest.yaml` (sibling to `scope-manifest.yaml`) + JSON-Schema validator; the back half reads it.
- Demotion of `workplan.md` to the rendered face of the manifest's ledger (no longer an author).
- A provider port: `detect()`, `capabilities()`, `author()`, `normalize()`. `reconcile()` as provider-agnostic core (not part of the port).
- The `normalize()` projection contract: task spine 1:1 from provider, acceptance-criteria pass-through tagged by `kind`, phase **overlay** via the granularity rule.
- The granularity-reconciliation rule, driven by the tracker capability (phases exist mainly as the issue unit).
- `reconcile()` re-sync semantics: one-way upstream→downstream, fossilizing the provider artifact, propose-then-apply, with the deskwork-origin protection guarantee.
- Adapters: `native` (reference, driver), `spec-kit` (driver, shells `specify`), `kiro` (importer).
- Tracker capability: `none` (new default), `github-parent-only`, `github-per-phase` (opt-in), with the four `gh`-touching skills (`issues`, `pickup`, `complete`, `debt-report`) capability-gated.
- Provider-version pinning in `.dw-lifecycle/config.json`; a `doctor` rule for provenance/config mismatch.
- Project-local adapter override seam (`.dw-lifecycle/providers/<name>/`).

**Out** (operator decisions recorded, not pre-emptive cuts):
- Bidirectional sync / live mirroring between manifest and provider artifact. Explicitly rejected; the relationship is one-way with explicit re-sync.
- Writing deskwork governance state back into provider artifacts.
- A new spec/intent format. The provider artifact stays the intent source-of-truth.
- Live-driver integration for Kiro. It owns its own IDE/branch/worktree state; realistically an importer this cycle.
- `github-lazy` tracker mode. Named as a future option; not built in v1.
- Non-GitHub trackers (Jira/Linear/etc.). The tracker capability is shaped to allow them later; no adapter now.

## Approach

Ports-and-adapters with the manifest as the port. `normalize()` is per-provider and translates strictly *into* the manifest (one-way, pure projection, no merge). `reconcile()` is deskwork core operating only on `(current, candidate)` manifests, matching by `provider_task_id` — providers never touch it. Tasks come from the provider 1:1 (deskwork never re-decomposes); phases become a thin grouping overlay whose existence is driven by the tracker capability, which ties the granularity decision to the issue decision (the same decision). Re-sync re-projects into a candidate and reconciles via propose-then-apply, with deskwork-origin tasks (no `provider_task_id`) carried through untouched — the guarantee that a provider re-author can't clobber finding state. Full architecture, schema, and the `normalize()`/`reconcile()` contracts in `design.md`.

## Tasks

- [ ] Extract `lifecycle-manifest.yaml` schema + validator; make the back half read it; `native` emits it alongside today's markdown (behavior-neutral refactor — load-bearing).
- [ ] Define the provider port + `native` adapter; route `define`/`setup` authoring through it (one provider, identical behavior).
- [ ] Implement `reconcile()` core + reconcile report + re-sync command (propose-then-apply).
- [ ] Build the `spec-kit` adapter; add `--provider` per-feature override + `install`-time detection/selection.
- [ ] Build the `kiro` importer; wire `capabilities().structured_criteria: ears` to stricter `ship` verification.
- [ ] Add the tracker capability (`none` default); gate the four `gh`-touching skills; demote per-phase issues to opt-in.
- [ ] Customization polish: project-local adapters under `.dw-lifecycle/providers/<name>/` without forking.
- [ ] Resolve OQ-1: confirm `scope-inventory` tolerates a single synthetic phase, or re-key its evidence onto tasks.
- [ ] Decide OQ-3 (`drifted` detection: normalized-exact vs similarity threshold) and OQ-4 (re-snapshot capabilities on reconcile vs freeze at first projection).

## Acceptance Criteria

- [ ] The back half (`implement`, `audit-barrage`, `promote-findings`, `re-audit-fixed-findings`, `scope-inventory`, `ship`, `complete`, `session-*`) contains zero branches on provider identity — only on `capabilities`. (grep gate.)
- [ ] With `provider: native`, the full lifecycle produces byte-identical user-visible behavior to pre-feature `dw-lifecycle` (the Phase 1–2 neutrality guarantee).
- [ ] With `provider: spec-kit`, `specify`'s `tasks.md` projects into a schema-valid manifest; `implement` walks it; a task-boundary `audit-barrage` fires unchanged.
- [ ] A re-sync after upstream task edits preserves `status`/`sha`/`governance` on unchanged tasks, flags drifted/orphaned, and leaves every `origin: deskwork` task untouched. (Verified by a reconcile test with an attached finding.)
- [ ] `tracker: none` makes `issues` a no-op and routes `pickup`/`complete`/`debt-report` to manifest+journal state with no `gh` calls.
- [ ] A provider-version mismatch between `provenance` and `.dw-lifecycle/config.json` is reported by `doctor`.
- [ ] Adding a stub future provider that implements only `normalize()` yields a runnable lifecycle (deskwork fills substrate, tracking, governance via capabilities).
