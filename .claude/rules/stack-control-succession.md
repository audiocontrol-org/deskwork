# stack-control succeeds dw-lifecycle — settled, do not relitigate

`stack-control` (CLI `stackctl`; brand: stackcontrol.org) is a new plugin being built as the **successor to `dw-lifecycle`**. This is an operator decision (2026-06-04 session), captured here so future sessions treat it as settled rather than re-deriving or re-debating it. The program detail lives in `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md`; this rule is the durable operational summary.

## Thesis (read this first — it grounds everything)

> **Invest heavily in up-front design and tooling; industrialize execution.**

stack-control is a **barbell**: disproportionate investment in the up-front half (design, scoping, spec authoring, insight capture, cross-model spec governance, scope discovery — where the leverage is), so the back half (execution) can be **industrialized** — parallel, multi-backend, worktree-isolated, unattended, and **independent of operator mood or attention**. The arc is craftsman → industrialist. Coding agents are *"insane, hyperintelligent toddlers"* — you don't fix them by yelling (rules), you fix them by **environmental/process design that makes failure states mechanically impossible**, with **stochastic correctness** (cross-model audit-barrage) as the teeth.

**Every new developer and every fresh agent session must read the full grounding before working here:** [`docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-thesis.md`](../../docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-thesis.md) (thesis + hard-won principles + the motivating blog post, [stackcontrol.org/blog](https://stackcontrol.org/blog/the-lifecycle-and-why-agents-need-one/)). If a design choice or piece of work doesn't trace back to the thesis, stop and reconsider.

## The settled decisions

1. **`stack-control` is a new plugin, in this monorepo**, **sharing the repository's single lockstep version** with every other plugin (operator decision 2026-06-05 — independent versions are harder to manage and the Claude marketplace update is monolithic; it does NOT get its own version line). Layout: a self-contained plugin under `plugins/stack-control/` mirroring `dw-lifecycle`'s real shape — in-tree TypeScript run via `tsx`, not a thin shell over a `packages/` package (`multi/front-door` plan R1, `specs/003-stack-control-front-door/research.md`). NOT a separate repo (the migration is an in-tree code move; a spin-out can happen after parity, never mid-migration).
2. **It is the successor to `dw-lifecycle`** via absorb-then-retire: bring the keepers (scope-discovery, audit-barrage, session-start / session-end, and the founding governance Spec Kit extension) into `stack-control` over successive features; retire `dw-lifecycle` once `stack-control` reaches parity for real work. Most keepers are an in-tree code move, but **session-start / session-end are rebuilt native, not ported** (operator decision 2026-06-09 — dw-lifecycle's are project-coupled to deskwork conventions; the `multi:feature/migrate-session-skills` roadmap item was cancelled and superseded by `multi:feature/session-skills`).
3. **Isolation is the point.** `dw-lifecycle` is in active use doing real work. `stack-control` must be developed and published WITHOUT destabilizing `dw-lifecycle`. Do not make changes that couple them or that risk `dw-lifecycle`'s working surfaces in the name of building `stack-control`.
4. **Founding feature = `impl/governance`** (slice 001, the `deskwork-governance` Spec Kit `after_implement` extension). The execution engine (`impl/execution-engine`, `specs/002-parallel-execution-engine/`) is a later feature, not the founding one. Program sequence is owned by `stack-control-roadmap.md` and is resequenceable; do not treat any feature's position as settled-by-this-rule.
5. **Naming convention:** product/plugin `stack-control`; CLI binary `stackctl`; skills `/stack-control:…`. **Features are identified by `<phase>/<slug>` codename** (`design/`, `plan/`, `impl/`, `multi/`), NOT by `F<n>` / ordinal — the numbers don't imply order (operator decision 2026-06-06; see `stack-control-roadmap.md` § naming convention).
6. **Two pluggability axes, kept separate:** the provider / plan-source port is DEFERRED (build the execution feature concretely against Spec Kit's `tasks.md`, generalize later); the execution-backend port is IN SCOPE (in-session sub-agent vs. batch CLI, selected by capability, never vendor identity).

## How to apply

- When work touches the `pluggable-lifecycle-providers` feature, read the program roadmap (`…/stack-control-roadmap.md`) first; build toward `stack-control`, not as new surface inside `dw-lifecycle`.
- New lifecycle capability built for this program goes in `plugins/stack-control/`, not `plugins/dw-lifecycle/`. Code migrating out of `dw-lifecycle` moves; it is not forked.
- Keep `dw-lifecycle` working throughout. A change that destabilizes `dw-lifecycle` to advance `stack-control` is the failure mode this isolation exists to prevent.
- Still-open decisions (npm scope; execution-feature tactical picks) are tracked in the roadmap and the 002 spec — open ≠ unsettled-direction. The succession itself is settled.

## Anti-patterns to refuse

- Re-proposing a separate repo for `stack-control` before parity (the migration is in-tree).
- Adding new lifecycle features into `dw-lifecycle` when they belong in the successor.
- Treating "stack-control succeeds dw-lifecycle" as an open question in a later session because it was only in conversation — it is recorded here precisely so it is not re-litigated.
- Coupling `stack-control` to `dw-lifecycle` internals (beyond the one-way execution → governance seam during the transition).

## Why this rule exists

The 2026-06-04 session defined the whole `stack-control` program across several turns of conversation. Per the project's memory-vs-rule discipline (`agent-discipline.md` § Memory-vs-rule placement), a durable cross-cutting decision goes in a rule, not auto-memory (which does not survive worktree switches or fresh clones). Without this file the program vision would live only in chat and spec blockquotes, and a future session would re-debate settled ground.
