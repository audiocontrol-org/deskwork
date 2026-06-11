---
name: roadmap
description: "Reason over and curate the stack-control roadmap — a governed heading-keyed DAG of work items with first-class depends-on / part-of / deferred-until edges. Answer next-ready / why-blocked / what-this-blocks, derive order, render a mermaid graph, reconcile against on-disk spec progress (report-only), and mutate (add / advance / decompose / reclassify / defer). Dry-run first, then apply. Wraps `stackctl roadmap`."
---

# /stack-control:roadmap

The roadmap is the program's **dependency-and-sequencing brain**: a governed,
heading-keyed markdown document (`plugins/stack-control/ROADMAP.md`) that is a
**DAG of work items**, so a fresh agent can determine what to work on next — and
why something is blocked — *from the document alone*, without re-explanation.

Each item is a heading-keyed Unit identified `<phase>:<kind>/<slug>` (phase ∈
`design|plan|impl|multi`, kind ∈ `feature|primitive|fix|gap`). Items are **peers**
bound by first-class typed edges:

- **`depends-on`** — a hard, acyclic dependency; satisfied **only when the target
  is `shipped`**. A `cancelled`/`retired` target is a permanent blocker (never
  satisfied), surfaced as such.
- **`part-of`** — non-blocking grouping (acyclic).
- **`deferred-until`** — a free-text condition that blocks readiness until the
  operator clears it.

Order is **derived** (topological over `depends-on`, tie-broken by the `phase`
relation `[design, plan, impl, multi]` then identifier) — never authored as a
position. Views (ready-list, blocked report, mermaid) are computed on demand and
never persisted.

> Per `.claude/rules/enforcement-lives-in-skills.md`, the discipline lives in
> this skill body + the `stackctl roadmap` verb it calls — it travels with the
> plugin install, not a git hook.

## Preconditions

- The document is **governable** (declares `doc-grammar: roadmap`) and parses:
  every `depends-on`/`part-of` target must exist (referential integrity) and the
  `depends-on`/`part-of` graphs must be acyclic. A dangling reference, a cycle, or
  a duplicate identifier fails loud (exit 2, zero writes) — fix the document, do
  not work around it.
- For a **mutation** (`--apply`), the document is committed first (version control
  is the recovery path; every mutation is zero-write on validation failure, but
  commit-before-apply keeps the history clean).

## Query / report (read-only — never writes)

```bash
plugins/stack-control/bin/stackctl roadmap next      [--doc <path>]   # ready-list
plugins/stack-control/bin/stackctl roadmap blocked   [--doc <path>]   # each blocked item + blockers
plugins/stack-control/bin/stackctl roadmap blocks <id> [--doc <path>] # what depends on <id>
plugins/stack-control/bin/stackctl roadmap order     [--doc <path>]   # derived topological order
plugins/stack-control/bin/stackctl roadmap graph     [--doc <path>]   # mermaid flowchart
plugins/stack-control/bin/stackctl roadmap reconcile [--doc <path>]   # report-only status-drift proposals
```

- **Start a fresh session here.** `roadmap next` answers "what can I pick up?";
  `roadmap blocked` answers "why not that one?" — read both before choosing work.
- `reconcile` **proposes only** (status drift from on-disk artifact progress at
  each item's `spec:` path, orphan spec dirs, unresolved correspondences). It
  **never mutates** a status — apply a proposal yourself via `advance`.

## Mutations (dry-run by default; add `--apply` to write)

```bash
# Capture emergent work in one move (kind + grouping + dependency together):
... roadmap add <id> [--status S] [--scope "…"] [--depends-on a,b] [--part-of p] \
                     [--deferred-until "…"] [--spec path] [--ref link] [--apply]

... roadmap advance <id>     --to <status>           [--apply]   # lifecycle status change
... roadmap decompose <id>   --into x,y,z            [--apply]   # split one → N; parts inherit status + depends-on + part-of + deferred-until; repoint dependents
... roadmap reclassify <id>  --to <new-identifier>   [--apply]   # rename + rewrite all referencing edges
... roadmap defer <id>       --until "…" | --clear   [--apply]   # set/clear the prose deferred-until
```

Every mutation **re-validates the whole graph before any write** and is
**zero-write on failure** (a dangling edge, a cycle, a duplicate identifier
leaves the document byte-for-byte unchanged). The kind + phase ride in the
identifier — there is no separate `--kind` flag; `reclassify` is how you change
them (it rewrites every referencing edge atomically).

> **Where a roadmap node can originate.** Roadmap work is not only authored fresh
> here — a node can **graduate up from the backlog**. When a found-work item in
> the [backlog](../backlog/SKILL.md) earns the full treatment, the operator
> `backlog promote <id> --to roadmap:<phase>:<kind>/<slug>` records the
> promotion linkage on the item (record-only), then creates the node here with
> `roadmap add`. By convention the new node carries the originating `TASK-<n>`
> ref in its body, so the promotion is navigable both ways. See
> [`/stack-control:backlog`](../backlog/SKILL.md) § *Promote into the feature
> rigor* for the canonical description of the seam.

## Steps (the discipline)

1. **Dry-run first, always.** Run the mutation without `--apply`; it reports the
   change and writes nothing. Read it to the operator.
2. **Apply on confirmation** with `--apply`. On a validation failure the document
   is unchanged — fix the inputs and retry; never bypass the validation.
3. **Capture, don't serialize.** When an out-of-sequence bug/gap surfaces
   mid-work, `roadmap add <phase>:<kind>/<slug> --part-of … --depends-on …` in one
   move and keep going — capture is instant; triage is a separate pass.
4. **Keep statuses honest.** `advance` an item when its real state changes;
   `reconcile` surfaces drift between recorded status and on-disk artifact
   progress, but you apply the proposal — reconcile never mutates.
5. **Re-decompose freely.** As understanding sharpens, `decompose` an item into
   peers (former dependents are repointed onto the parts) or `reclassify` its
   phase/kind — the graph re-validates each time.

## Anti-patterns to refuse

- **Authoring order by position.** Order is derived from `depends-on` + phase;
  never reorder sections to "set priority." Encode the dependency instead.
- **Working around a fail-loud.** A dangling reference / cycle / duplicate id is a
  real defect in the roadmap — fix the document, never edit around the validator.
- **Editing the roadmap by hand to add an item.** Use `roadmap add` so the whole
  graph re-validates; a hand-edit can introduce a dangling edge that only fails on
  the next load.
- **Treating `reconcile` output as applied.** It proposes; you confirm and
  `advance`.
