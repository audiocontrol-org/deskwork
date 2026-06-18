# Governed markdown is the foundation — settled, do not relitigate

stack-control's roadmap, inbox, and lifecycle-workflow are **governed parseable markdown documents** on the `document-primitives` engine (specs/005; consumed by `roadmap-protocol` 006 and `parseable-lifecycle-workflow` 022). The question *"should we move these onto Backlog.md / a Beads-style graph DB / some other task tool instead?"* was confronted head-on and **answered: keep the governed-markdown foundation.** This is an operator decision (2026-06-18), recorded here so future sessions treat it as settled rather than re-deriving it every time the overlap with Backlog.md (an existing dependency) is rediscovered.

## The decision (one-line)

> Keep governed markdown. Adopt a parser **library** for CLI ergonomics; do **not** migrate the store to a task/graph tool.

## Why (the decisive argument — internalize this)

No external tool (Backlog.md, Beads, …) provides stack-control's **novel core**: `depends-on`-satisfied-only-when-`shipped`, non-blocking `part-of`, `deferred-until`, and the design→spec→impl workflow/compass integration. That core is built on top of **whatever** store backs the roadmap. So adopting a tool would save mostly the *operations* (CLI / `--help` / edit / grouping) — and those are recovered far more cheaply by adopting a mature **arg-parser library** (clap/Typer/Cobra/oclif-style), **without** abandoning the foundation. The migration's net benefit is small; its cost (foundation churn across three shipped specs + a new runtime/store) is large. The foundation is also thesis-core: the governed docs *are* the context a fresh agent reads, they are git-diff-reviewable, and they carry no external runtime (Beads' Dolt dependency would violate "travels with `claude plugin install`"). Scale does not force a change — the roadmap is ~50 nodes.

The full reasoning, alternatives, and consequences live in the ADR: [`docs/superpowers/specs/2026-06-18-governed-markdown-foundation-adr.md`](../../docs/superpowers/specs/2026-06-18-governed-markdown-foundation-adr.md). The prior-art sweep that grounded it: `docs/superpowers/specs/2026-06-18-roadmap-prior-art-research.md`.

## How to apply

- **Self-documenting CLI / `--help`:** adopt a parser library; do NOT hand-roll a bespoke "shared parser combinator." Help/usage/completion derive from one command definition (the commodity pattern). This is the re-scoped 027 discoverability pillar.
- **Keep `roadmap-model` (typed-graph semantics) cleanly abstracted from `document-model` (store).** Harden that seam; it is the single contained place a future store swap would happen.
- **When the Backlog.md overlap is rediscovered** (it will be — Backlog.md already backs `stackctl backlog`, and it self-documents + edits dependencies + groups), the answer is *"yes, it overlaps the operations; no, we do not move the roadmap onto it"* — point at the ADR, don't re-run the analysis.

## Revisit-if (the door is not welded shut)

Re-open the store decision ONLY when one of these is actually true (not speculatively):
1. The roadmap graph outgrows flat-markdown — real parsing/ordering/merge-conflict cost at scale (the Beads ceiling). Then reconsider a graph store *behind the hardened seam*.
2. A deliberate product-strategy decision to unify task/graph management across `backlog` + `roadmap` (+ maybe inbox/workflow) onto one engine. A strategic call, not a technical-forcing one.

## Anti-patterns to refuse

- Proposing a migration of roadmap/inbox/workflow onto Backlog.md/Beads because *"it already does all this"* — most of "all this" is operations, addressed by a library; see the decisive argument.
- Hand-rolling a bespoke arg-parser/help system when a library gives non-drift help for free.
- Treating "keep governed markdown" as an open question in a later session because it was only in chat — it is recorded here precisely so it is not re-litigated.

## Why this rule exists

The 2026-06-18 session, mid-authoring spec 027 (roadmap edge-mutation + cluster), discovered Backlog.md (an existing dependency) ships most of 027's operations, and escalated to a foundational reconsideration of the governed-markdown bet. Per `agent-discipline.md` § Memory-vs-rule placement, a durable foundational decision goes in a rule (auto-memory does not survive worktree switches or fresh clones). Without this file the decision would live only in the ADR + chat, and a future session would re-debate settled ground the next time it noticed the Backlog.md overlap.
