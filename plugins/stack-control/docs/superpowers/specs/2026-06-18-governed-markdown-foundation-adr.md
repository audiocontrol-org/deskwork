# ADR — Keep the governed-markdown foundation; adopt libraries for CLI ergonomics

**Date:** 2026-06-18
**Status:** Accepted (operator decision, this session)
**Scope:** Foundational — the `document-primitives` engine (specs/005) and its consumers `roadmap-protocol` (006), `parseable-lifecycle-workflow` (022). THESIS-level.
**Supersedes/amends:** the discoverability pillar of `2026-06-18-roadmap-edge-mutation-and-cluster-design.md` (re-scoped here from "build a bespoke shared parser" to "adopt a parser library"). Does not rewrite that record; this ADR is the governing decision.

## Context

While authoring spec 027 (`impl:gap/roadmap-edge-mutation-and-cluster`), we discovered that the open-source tool **Backlog.md** — which stack-control *already depends on* as the `stackctl backlog` backend — ships much of what 027 set out to build for the roadmap: a fully self-documenting CLI (`--help` on every command, shell completion), dependency editing on existing items (`task edit --depends-on`), parent/sub-task + milestone grouping, and dependency-ordered `sequence` scheduling. A prior-art sweep (recorded in `2026-06-18-roadmap-prior-art-research.md`) widened the picture: **Beads** (Steve Yegge's agent-native graph issue-tracker) models typed edges, a `ready` work-list, and an epic-vs-blocking distinction much like our `depends-on` vs `part-of` — but deliberately stores in a **SQL/Dolt database, not markdown**, having judged flat files insufficient for graph queries at scale; **markdown-plan** is the closest single-markdown-document DAG analog (but untyped edges); **Org-mode / Org Edna** already implement lifecycle-state-gated blocking dependencies; **Airflow** distinguishes non-blocking `TaskGroup` grouping from blocking dependency edges and gates on upstream state.

This raised a genuine foundational question, which the operator chose to confront head-on: **is a governed parseable markdown document the right foundation for stack-control's roadmap / inbox / workflow, or should we adopt a mature task/graph tool (Backlog.md / Beads-style) instead?**

The `document-model` engine currently backs three governed documents: `ROADMAP.md` (typed-edge DAG — the graph-heavy one), `WORKFLOW.md` (a small static lifecycle state-machine), and `DESIGN-INBOX.md` (a capture list). The architecture is already cleanly layered: `document-model` (generic governed-markdown store: parse + edge-extraction + referential-integrity + acyclicity) is consumed by `roadmap-model` (the typed-graph semantic projection — `WorkItem` with `dependsOn`/`partOf`/`deferredUntil`/lifecycle markers). The store and the typed-edge/lifecycle semantics are therefore **already decoupled**.

## Decision

**Keep `document-primitives` (governed parseable markdown) as the foundation.** Do **not** migrate the roadmap/inbox/workflow onto Backlog.md, Beads, or any external task/graph store at this time. Specifically:

1. **Address the real pain (CLI-ergonomics reinvention) by adopting a mature argument-parser library** for the `stackctl` surface, so `--help` / usage / per-subaction help / shell completion derive from a single command definition (the commodity pattern proven by clap/Typer/Cobra/oclif and shipped by Backlog.md). Do **not** hand-roll a bespoke "shared parser combinator."
2. **Harden the store seam now.** Keep `roadmap-model`'s typed-graph semantics cleanly abstracted from `document-model` so that a future store swap, if ever warranted, is contained to that seam rather than spread through the verbs/views/mutations.
3. **Build the novel governance core bespoke regardless** — `depends-on`-satisfied-only-when-`shipped`, non-blocking `part-of`, `deferred-until`, and the design→spec→impl workflow/compass integration. No off-the-shelf tool provides this; it is built on top of whatever store backs the roadmap.

## Rationale

- **The decisive argument — adoption does not save the novel core.** Neither Backlog.md nor Beads provides the lifecycle-coupled edge semantics or the workflow-gate integration; we build those on top of *any* store. So a foundational migration would save mostly the *operations* (CLI/`--help`/edit/grouping) — and those are recoverable far more cheaply via a parser library, **without** abandoning the foundation. The migration's net benefit is small; its cost (foundation churn across three shipped specs + a new runtime/store) is large.
- **Thesis alignment.** The governed markdown documents *are* the context a fresh agent reads and reasons over — no query layer, no daemon, natively agent-legible. Human-readable git diffs make every governance mutation reviewable (every roadmap change this session was a one-line auditable diff). No external runtime means the discipline travels with `claude plugin install` (Beads' Dolt dependency is a real adoption tax that contradicts this).
- **Scale does not force the change.** Only the roadmap is graph-heavy, and it is ~50 nodes — far below the scale that drove Beads to SQL. `WORKFLOW.md` and `DESIGN-INBOX.md` are not graph-heavy at all.
- **The seam already exists**, so deferring a store decision is safe and reversible; the right response to "the store might not scale forever" is to harden the seam, not to migrate pre-emptively.

## Alternatives considered

- **Adopt Backlog.md as the roadmap store** (one engine for backlog + roadmap). Rejected now: fractures the document-primitives uniformity for one consumer, one-file-per-task loses the single-governed-document property, Backlog.md's simpler edge model (single deps + parent + milestone) needs mapping to our typed edges, and it still does not provide the novel governance core. Remains a *strategic* option (see revisit-if).
- **Adopt a Beads-style graph store (SQL/Dolt).** Rejected now: strongest graph machinery and the closest agent-native peer, but the heaviest divergence — new runtime, loss of markdown git-diffs, largest migration — for scale we do not have. Its existence is a useful long-horizon signal, not a present need.
- **Reconsider document-primitives wholesale and migrate all three consumers.** Considered (this was the operator's chosen altitude for the discussion) and rejected on the rationale above: the foundation is thesis-core and the trigger (operations reinvention) is addressable without it.
- **Proceed with 027 as specced (bespoke shared parser).** Rejected: reinvents a commodity library feature.

## Consequences

- **Spec 027 re-scopes.** The discoverability pillar (US1 / FR-001–006) changes from "build a shared parser combinator primitive" to "adopt a parser library; roadmap is the first verb migrated onto it." The cluster verb, honest header, and lifecycle edges are unchanged. The store seam hardening is added. Net: roughly half the original build; no foundational migration. The `roadmap-edge-mutation-and-cluster` roadmap node scope is updated to match.
- **The deferred siblings** (edge-mutation verb set; verb-surface consolidation rollout) are unchanged in intent; the consolidation rollout now means "migrate the remaining ~49 verbs onto the adopted parser library," not onto a bespoke combinator.
- **No change to inbox/workflow** stores; they remain governed markdown on `document-model`.

## Revisit-if triggers (this door is not closed forever)

1. The roadmap graph grows large or query-heavy enough that flat-markdown parsing, ordering, or merge-conflict pain becomes a real operator cost (the Beads ceiling) → reconsider a graph store *behind* the hardened `roadmap-model` seam.
2. A deliberate product-strategy decision to unify task/graph management across `backlog` + `roadmap` (and possibly inbox/workflow) onto one engine (Backlog.md / Beads-style) — a strategic call, not a technical-forcing one.

## Provenance

- Triggered by the offing dogfood → spec 027 authoring → the realization that Backlog.md (already a dependency) ships most of 027's operations.
- Prior-art research: `2026-06-18-roadmap-prior-art-research.md` (deep-research workflow; verification rate-limited; Beads + markdown-plan directly WebFetch-verified).
- Architecture grounding: `roadmap-model.ts` ("typed graph over the document-model"); `document-model` consumers = roadmap, inbox, workflow; `document-primitives` spec 005.
- Decision: operator, this session (2026-06-18), at the "reconsider document-primitives wholesale" altitude, accepting "keep the foundation; adopt-a-lib for ops; harden the seam; record revisit-if triggers."
