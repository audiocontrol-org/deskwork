---
title: Roadmap protocol — design
date: 2026-06-08
status: design-approved (brainstorming output; feeds /speckit-specify)
feature-codename: design/roadmap-protocol
---

# Roadmap protocol — design

> **Post-clarify note (2026-06-08):** `/speckit-clarify` refined the item identifier
> from `<phase>/<slug>` (as shown in the examples below) to **`<phase>:<kind>/<slug>`**
> (e.g. `impl:fix/roadmap-cycle-detection`), with a first-class `reclassify` operation
> for changing phase/kind. The canonical, current form is in
> `specs/006-roadmap-protocol/spec.md` (Clarifications + FR-001/FR-001a). The examples
> in this design doc retain the original shape for historical fidelity.

> Brainstorming output. Captures the decisions and their rationale so the
> subsequent Spec Kit spec (`/speckit-specify`) is authored from a settled
> design rather than re-derived. Per the program lifecycle this is the
> design-capture artifact; the canonical spec lands under
> `specs/<NNN>-roadmap-protocol/`.

## Motivation — the use case, in the operator's terms

The roadmap exists to **reason about and capture decisions about what needs to
be built and roughly in what order.** It is a *thinking and decision-capture
surface*, not primarily a status dashboard. Three lived needs drive it:

1. **Capture the rough shape early.** Often the operator knows the general shape
   of a thing that needs building before it exists, and wants to record that
   shape without it being lost.

2. **Absorb mid-build re-decomposition.** While building something, it becomes
   clear that new or different things need building, or that the work should be
   decomposed differently. "Living = the most up-to-date map of the road" — and
   the road can be *re-routed*, not merely progressed along.

3. **Hold dependencies and execution order as durable structure.** The operator
   has to remind agents about dependency relationships constantly. *"Relitigating
   how it all is supposed to fit together is exhausting, and every time it
   happens is an opportunity to fuck it up."* The roadmap's job is to decide how
   the pieces fit together **once**, durably and machine-checkably, so it is
   never relitigated from memory.

### The motivating failure (this very session)

When we began defining the roadmap feature, the agent **did not know the
`archive`/`curate` primitives were already built** (shipped in 005
`design/document-primitives`), and re-derived a stale decomposition. The map
should have carried that done-state and the dependency ("roadmap protocol sits
*on top of* the archive/curate primitives") so a fresh agent acts correctly
without the operator re-explaining.

The current top-level `docs/1.0/.../stack-control-roadmap.md` is a **degraded
mess precisely because it was created with no structure or discipline.** Agents
are bad at memory, structure, and discipline (the thesis: *"insane,
hyperintelligent toddlers"* — fix the environment, not the agent). The
**design-inbox cannot fix this**: the inbox is tuned for *frictionless capture*,
which deliberately discards structure (deps, order, decomposition). So there is
a **handoff** — rough shape lands in the inbox; the roadmap is where it gets
*promoted into structure* (dependencies, order, decomposition) and then
maintained as new work emerges.

This design traces to the thesis (`stack-control-thesis.md`): invest in up-front
design/tooling; encode structure so a failure state (an agent rebuilding,
reordering, or relitigating) becomes **mechanically preventable**, not a
vigilance task.

## What already exists (do not rebuild)

From 005 `design/document-primitives` (shipped + governed):

- The **document-model engine** (`plugins/stack-control/src/document-model/`):
  grammar-bound, self-describing governed markdown; `archive` / `unarchive` /
  `curate` engines + `stackctl` verbs + `/stack-control:*` skills.
- **Heading-keyed grammar support** (the `design-inbox` grammar is heading-keyed)
  and **row-keyed** support (the `roadmap` grammar).
- A **`roadmap` grammar** + a governed `plugins/stack-control/ROADMAP.md`. The
  grammar already declares status vocabulary (`planned`, `in-flight`, `shipped`,
  `cancelled`, `retired`), the terminal set (`shipped`/`cancelled`/`retired`),
  the `phase` order relation `[design, plan, impl, multi]`, and a
  **`reconciliationHook`** (`glob: specs/*/spec.md`).
- `curate` already **recognizes but does not execute** that hook — it emits one
  `up-to-date-seam` finding (`curate-engine.ts:96-102`) and the curate skill
  explicitly scopes execution *out* of the primitive. **The seam was built
  waiting for this protocol to plug into it.**

The roadmap protocol is a **consumer** of the generic engine, not a rebuild of
it.

## Decision 1 — the roadmap is a DAG of work items

Settled core model (operator-approved):

**An item** carries:

- **identifier** — stable, human-readable, non-ordinal (today `<phase>/<slug>`;
  the engine already enforces these properties).
- **kind** — `feature` / `primitive` / `fix` / `gap`. A mid-build bug is a
  first-class item, not a lost note.
- **status** — `planned` / `in-flight` / `shipped` / `cancelled` / `retired`
  (already declared; terminal set already declared).
- **shape/scope** — the rough prose of what it is (the "general shape" captured
  early).
- **dependency edges** — first-class, typed, referencing other items *by
  identifier*.

**Two edge types** (the use case has exactly two):

- **`depends-on`** (hard) — e.g. "roadmap-protocol depends-on
  document-primitives." Referential-integrity-checked (every edge targets a real
  item) and **acyclic** (a cycle is fail-loud). Drives *ready vs blocked*.
  Satisfied when the target item is `shipped`.
- **`deferred-until`** (conditional/soft) — e.g. "apply-archive-to-journal
  deferred-until 'primitive bugs shaken out via roadmap-protocol'." Carries a
  **prose condition**, not just a target. It blocks readiness, but the *release*
  is an operator judgment, not an automatic on-ship event. The condition is the
  content, so it persists instead of living in the operator's head.

**`part-of`** (grouping, non-blocking) — an optional edge from a `fix`/`gap` to
its parent feature, so the top-level map stays readable while items remain peers.

**Item granularity: peers** (operator-approved). A discovered bug is a *peer*
item in the DAG with its own edges (so it can block anything), with an optional
`part-of` edge to recover readability by grouping. Not a nested child.

**Order is derived, not hand-maintained.** A topological sort over `depends-on`,
with the `phase` relation `[design, plan, impl, multi]` as tiebreaker. The
operator states dependencies; order falls out. Manual re-sequencing stops.

**What the tool computes over the DAG** (the "reason over it, don't just hold
it" choice):

- **next-ready** — items whose hard deps are all `shipped` and that have no
  unmet `deferred-until`. "Here's what you can actually start."
- **blocked-by / blocks** — "you can't start X; Y is still `planned`" and "this
  bug blocks these three things."
- **cycle + dangling-edge detection** — fail-loud; the graph cannot silently rot.
- the **reconciliation backstop** (secondary; see Decision 4).

## Decision 2 — heading-keyed governed markdown, not a table, not a database

The representation question ("should we back it with a real database?") was
worked through explicitly. **Answer: no database; heading-keyed governed
markdown.** The *table* was the problem, not markdown.

**One section per item:**

```markdown
## impl/execution-engine
- kind: feature
- status: planned
- depends-on: design/document-primitives, multi/front-door
- deferred-until: —
Parallel multi-backend execution engine. Worktree-isolated,
capability-selected fan-out across distinct coding agents.

## fix/roadmap-cycle-detection
- kind: fix
- status: planned
- part-of: design/roadmap-protocol
- depends-on: design/roadmap-protocol
Found while dogfooding: a dependency cycle should fail loud...
```

Rationale (why not a database):

- **The primary consumer is a fresh agent session reading the file in-context.**
  An agent reads a markdown doc directly and can eyeball the whole thing to
  orient. A SQLite DB is opaque to a file-reading agent — it must run queries it
  has to know to run and cannot scan the whole map. Close to disqualifying for
  this consumer.
- **The roadmap's history *is* the decisions** — it must live in git as
  **diffable text** that is reviewable ("why did this resequence" stays a
  readable diff). A DB is an opaque blob in git.
- **Must survive worktree switches / fresh clones as something legible** (same
  reason rules live in `.claude/rules/`, not auto-memory).
- A DB would **abandon the archive/curate/unarchive + roadmap-grammar
  investment** and force a query layer to do what an agent does today by reading.
- The DB benefits — query performance, integrity-at-scale, concurrent writes —
  are **moot at this scale** (~dozens of items, single-writer, read in-context).
  Referential integrity + acyclicity come from a validate/`curate` pass over a
  dozen items in milliseconds, not a DB engine.

**When a DB *would* be right:** thousands of items, many concurrent writers,
real-time multi-surface queries, relational joins across many entity types. None
is true now; text→DB migration is straightforward if it ever becomes true.
YAGNI.

**Heading-keyed reuses the engine's existing path** (the `design-inbox` grammar
is heading-keyed); `archive`/`curate` already operate on it (terminal items
archive out).

## Decision 3 — architecture: generic edge capability + roadmap semantic layer

Preserve the engine's genericity ("many kinds of structured documents") by
splitting along the generic/semantic line:

- **Generic (document-model engine):** parse a declared **edge-field** on any
  Unit — a heading-keyed grammar declares that certain field-lines
  (`depends-on:`, `part-of:`, `deferred-until:`) are *typed references to other
  Units by identifier*. The engine validates **referential integrity** (every
  referenced identifier exists) and **acyclicity** for edge-types declared
  acyclic. Any future governed doc gets edges for free. This extends what the
  engine already owns (identifiers, units).
- **Semantic (roadmap layer):** interpret edges against the *status vocabulary*
  — "a `depends-on` is satisfied when the target is `shipped`," next-ready,
  blocked-by, derived views, and the reconciliation backstop. Roadmap-specific
  because it knows what `shipped` means.

**Surface:** a new `stackctl roadmap` verb + `/stack-control:roadmap` skill (the
semantic layer) over the generic edge capability. `curate`/`archive` keep working
unchanged; the roadmap is "a governed doc that also has edges." Per
`.claude/rules/enforcement-lives-in-skills.md`, the discipline lives in the skill
body + the CLI verb — never a git hook.

## Decision 4 — the living-document protocol (how it stays current)

Three mechanisms:

1. **Mutation operations** (the verb; low-friction so it actually gets used):
   - `add` an item (with kind + edges).
   - `advance` status.
   - `decompose` — split one item into N, rewriting edges. The mid-build
     re-decomposition is a **first-class operation**, not a hand-edit.
   - `defer` — set a `deferred-until` condition.
   - `archive` terminal items out (composes the existing `curate`/`archive`).
   - **Every mutation re-validates the graph** (referential integrity +
     acyclicity). The map *cannot* be left in a broken state.

2. **Emergent-work capture** — `roadmap add --kind fix --part-of <current>
   --depends-on <…>` in one move when a bug/gap surfaces mid-build. It lands as a
   peer item with its edges, so it is neither forgotten nor stripped of its
   ordering/blocking relationships. This is the "scope it in as we go" flow that
   prevents the inbox's structure-loss.

3. **Reconciliation backstop** (detection half; secondary) — `roadmap reconcile`
   executes the declared hook and flags items whose `status` disagrees with
   on-disk reality. **Report-only / propose — never auto-mutates**
   (operator-approved): the roadmap is *intent*, and intent must not be silently
   overwritten by execution state. It surfaces e.g. "`design/document-primitives`
   is `in-flight` but its spec graduated — advance to `shipped`?" and the
   operator decides.

**Enforcement posture (thesis thread):** build the **query/report now**
(`roadmap next`, `roadmap blocked`, so a surface/agent can be *told* "X isn't
ready, dep Y is planned"); **defer hard out-of-order gating** (refuse to start
out-of-order work) to a follow-up item *on the roadmap itself* —
operator-approved. Dogfoods the capability.

## Decision 5 — migration is real work and is the first dogfood

Two roadmaps exist today: the rich-but-degraded prose
`docs/1.0/.../stack-control-roadmap.md`, and the thin governed
`plugins/stack-control/ROADMAP.md`. The protocol makes **the governed one
canonical.** Migration = port the program roadmap's real content (scope prose,
the dependency relationships currently buried in prose notes, sequencing
rationale) into heading-keyed items with **explicit edges**, then retire the
prose roadmap to a pointer. This migration is the **first real dogfood** of the
protocol and is expected to surface the bugs the operator predicted — which then
get captured as `fix` items via mechanism 2.

## Derived views (queryability without DB opacity)

Source of truth stays readable markdown; **derived views are computed on demand
by the verb** — a `roadmap next` ready-list, a `roadmap blocked` report, and a
mermaid DAG diagram emitted from the edges. Rendering is fully decoupled from
storage: the verb is the query engine, the markdown is the truth.

## Testing approach (per `.claude/rules/testing.md`, TDD-first)

- **Engine (generic edges):** unit tests for edge-field parsing, referential
  integrity (dangling edge → fail-loud), acyclicity (cycle → fail-loud), on
  fixture documents on disk (never mock the filesystem).
- **Roadmap layer:** unit tests for next-ready / blocked-by / blocks / topo
  order over fixture DAGs covering: linear chain, diamond, unmet
  `deferred-until`, terminal-status satisfaction, `part-of` non-blocking.
- **Mutations:** integration tests that each mutation re-validates and refuses to
  write a broken graph (zero-write on validation failure, mirroring
  `curate`'s FR-010 posture).
- **Reconcile:** tests that it reports/proposes and **never mutates**.
- **Migration:** a lossless-port test analogous to 005's `DESIGN-INBOX.md`
  migration proof.
- Follows the spec-authoring discipline (promises before mechanism): precise
  write protocols / parser internals are pinned by RED tests + `contracts/`, not
  over-specified in prose.

## Open questions (capture, not yet scoped — for `/speckit-clarify`)

- **`deferred-until` representation:** prose-only condition, or also an optional
  *target item* whose status the tool watches as a hint? (Lean: prose condition
  is the content; an optional target is a convenience, not required.)
- **Reconciliation source-of-truth signal:** Spec Kit artifact progression vs.
  governance-graduation/merge vs. layered. Deferred during brainstorming as a
  reconcile-engine detail; reconcile is the *secondary* half, so resolve at
  spec/clarify time. The row↔spec-dir correspondence is non-trivial (codename
  `impl/execution-engine` ↔ dir `002-parallel-execution-engine`;
  `impl/governance` ↔ `001-speckit-backhalf-slice`) — reconciliation needs an
  explicit correspondence mechanism, not slug-equality.
- **`design/roadmap-protocol` self-listing:** the protocol should itself be a
  roadmap item, but cannot add itself before it exists (chicken-and-egg). Interim:
  add the row by hand at setup; thereafter it self-maintains.
- **Relationship to issues / audit-log:** a `fix` item vs. a GitHub issue vs. an
  audit-log finding — placement of the roadmap relative to existing
  `promote-findings` / issues machinery (the design-inbox "idea-bucket ↔ roadmap
  relationship" entry, Unit 5, partially overlaps here).

## Decomposition context (for sequencing this feature)

This feature is **Unit 2 + Unit 3** of the design-inbox roadmap cluster (the
protocol + its mechanical home). Unit 1 (substrate) and Unit 4 (archive) are
already built (005). Unit 5 (capture↔roadmap promotion seam) remains deferred —
blocked on `design/insight-capture` and decision-shaped. The generic edge
capability added here is a small extension to the 005 engine, consumed first by
the roadmap.
