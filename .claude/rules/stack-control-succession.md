# stack-control succeeds dw-lifecycle — settled, do not relitigate

`stack-control` (CLI `stackctl`; brand: stackcontrol.org) is a new plugin being built as the **successor to `dw-lifecycle`**. This is an operator decision (2026-06-04 session), captured here so future sessions treat it as settled rather than re-deriving or re-debating it. The program detail lives in `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md`; this rule is the durable operational summary.

## The settled decisions

1. **`stack-control` is a new plugin, in this monorepo**, with its own version line — a new workspace package under `packages/` + a plugin shell under `plugins/stack-control/`. NOT a separate repo (the migration is an in-tree code move; a spin-out can happen after parity, never mid-migration).
2. **It is the successor to `dw-lifecycle`** via absorb-then-retire: move the keepers (scope-discovery, audit-barrage, session-start / session-end, and the founding governance Spec Kit extension) out of `dw-lifecycle` into `stack-control` over successive features; retire `dw-lifecycle` once `stack-control` reaches parity for real work.
3. **Isolation is the point.** `dw-lifecycle` is in active use doing real work. `stack-control` must be developed and published WITHOUT destabilizing `dw-lifecycle`. Do not make changes that couple them or that risk `dw-lifecycle`'s working surfaces in the name of building `stack-control`.
4. **Founding feature = slice 001** (the `deskwork-governance` Spec Kit `after_implement` extension). The **execution engine is the next feature** (`specs/002-parallel-execution-engine/`), not the founding one.
5. **Naming convention:** product/plugin `stack-control`; CLI binary `stackctl`; skills `/stack-control:…`.
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
