# Feature Specification: Roadmap protocol

**Feature Branch**: `feature/stack-control` (program single-branch convention; spec dir `006-roadmap-protocol`)

**Created**: 2026-06-08

**Status**: Draft

**Codename**: `design/roadmap-protocol`

**Input**: User description: "Roadmap protocol — a governed, plugin-local roadmap that is a DAG of work items: the program's dependency-and-sequencing brain a fresh agent session reads to act correctly without the operator re-explaining how the pieces fit together." Full approved design: `docs/superpowers/specs/2026-06-08-roadmap-protocol-design.md` (source of truth for this spec).

## Why this feature exists (motivating context)

The roadmap exists to **reason about and capture decisions about what to build and roughly in what order** — a *thinking and decision-capture surface*, not a status dashboard. The operator often knows the rough shape of a thing before it exists and needs to record it; mid-build it frequently becomes clear that the work must be decomposed differently; and dependency relationships have to be re-explained to agents constantly. The operator's framing: *"Relitigating how it all is supposed to fit together is exhausting, and every time it happens is an opportunity to fuck it up."* The roadmap's job is to decide how the pieces fit together **once**, durably and machine-checkably, so it is never relitigated from memory.

The motivating failure occurred while scoping this very feature: the agent did not know the `archive`/`curate` primitives were already built (005) and re-derived a stale decomposition. The current prose roadmap is a degraded mess because it had no structure or discipline; the low-friction design-inbox cannot fix this because frictionless capture deliberately discards structure (dependencies, order, decomposition). This feature is the structured handoff target where captured shape is promoted into durable, machine-checkable structure. It is a direct expression of the thesis: encode the dependency graph so that "an agent rebuilds / reorders / relitigates" becomes a *mechanically preventable* failure, not a vigilance task.

## Clarifications

### Session 2026-06-08

- Q: Identifiers & ordering for non-feature items (`fix`/`gap`/`primitive`) when those aren't phases? → A: Identifier is `<phase>:<kind>/<slug>` (e.g. `impl:fix/roadmap-cycle-detection`); `kind` is derived from the identifier; phase still drives the order relation `[design, plan, impl, multi]`. Re-classification (changing phase/kind) is a first-class `reclassify` operation that rewrites all referencing edges atomically — never a hand-edit.
- Q: How does a roadmap item map to its on-disk feature for reconciliation (codenames ≠ numbered spec dirs)? → A: An explicit, optional correspondence field on the item (e.g. `spec: specs/002-parallel-execution-engine`) that points at its on-disk artifact once one exists; no fuzzy/slug matching. An item with no field is "not yet started." The declared `glob` serves the reverse check (a spec dir with no roadmap item is an orphan to flag).
- Q: What on-disk signal determines a feature's real state for reconciliation? → A: Artifact progression in the linked spec dir — `spec.md` only ≈ early; `+plan`/`+tasks` ≈ in-flight; `tasks.md` fully checked plus a governance-graduation record ≈ shipped. Self-contained (governance writes its records into the feature dir), no git/gh dependency. Advisory only.
- Q: `deferred-until` representation — prose-only or a machine-watched target? → A: Prose-only condition. It blocks readiness while present; the operator clears it when satisfied (release is operator judgment). Matches the fuzzy learning-milestone example; a machine-checkable variant is a future roadmap item, not v1.
- Q: How do roadmap `fix`/`gap` items relate to GitHub issues / audit-log findings? → A: Distinct. The roadmap is authoritative for sequencing/dependencies only; an item MAY carry an optional reference (link) to an issue or finding, but does NOT subsume either tracker. Issues keep work-tracking + the closure gate; the audit-log keeps findings. Deeper `promote-findings` integration is the deferred capture-seam work, not v1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A fresh agent reads the roadmap and acts correctly (Priority: P1)

A new agent session, with no prior context, reads the roadmap and can determine: what is already built (trustworthy done-state), what depends on what, and therefore what it may and may not start — *without the operator re-explaining*.

**Why this priority**: This is the core value and the motivating failure. If the roadmap doesn't reliably orient a fresh agent, nothing else matters.

**Independent Test**: Hand a fresh session only the roadmap document; ask "what is the next thing that can be built, and why not X?" The session answers correctly (deps satisfied / blocked-by named) from the document alone.

**Acceptance Scenarios**:

1. **Given** a roadmap where item B declares `depends-on: A` and A is `shipped`, **When** an agent asks what is ready, **Then** B is reported ready.
2. **Given** the same roadmap but A is `planned`, **When** an agent asks to start B, **Then** the roadmap reports B is blocked by A (with A's status named).
3. **Given** an item marked `shipped`, **When** an agent considers proposing that work, **Then** the done-state is unambiguous and the agent does not re-derive it as un-built.

### User Story 2 - Capture emergent work mid-build in one move (Priority: P1)

While building something, a bug or feature gap surfaces. The operator (or agent) records it as a first-class roadmap item *in one move*, with its kind, its dependency relationships, and its grouping — so it is neither forgotten nor stripped of its ordering/blocking relationships.

**Why this priority**: The "scope it in as we go" flow is what keeps the map live and prevents the structure-loss that makes the inbox unsuitable for this. Equal-first with US1.

**Independent Test**: Mid-task, add a `fix` item that is `part-of` the current feature and `depends-on` another item, in a single command; confirm it appears as a peer node with its edges intact and the graph still validates.

**Acceptance Scenarios**:

1. **Given** an in-flight feature, **When** the operator captures a discovered bug as a `fix` item with `part-of` and `depends-on` edges, **Then** the item is added as a peer with those edges and the graph re-validates.
2. **Given** a capture that would reference a non-existent item, **When** the capture is attempted, **Then** it is refused (no dangling edge written) with an actionable message.

### User Story 3 - Mid-build re-decomposition as a first-class operation (Priority: P2)

When it becomes clear that one item should become several (or be reshaped), the operator re-decomposes it through a supported operation that rewrites the affected edges and leaves the graph valid — rather than a freehand edit that silently breaks references or ordering.

**Why this priority**: The distinctive "living map / re-route the road" need. Important but builds on the item+edge model from US1/US2.

**Independent Test**: Decompose one item into N; confirm edges that pointed at the original are handled explicitly and the resulting graph validates (no dangling edge, no cycle).

**Acceptance Scenarios**:

1. **Given** item X with dependents, **When** X is decomposed into X1…Xn, **Then** the operation resolves what the former dependents now point at and the graph re-validates.
2. **Given** a re-decomposition that would create a cycle, **When** it is attempted, **Then** it is refused with the cycle named and nothing is written.

### User Story 4 - Query the dependency graph (Priority: P2)

The operator or an agent asks the roadmap questions and gets computed answers: what is ready to start, what is blocked and by what, what a given item blocks, and a visual of the graph.

**Why this priority**: Turns the structure into leverage; the "reason over it, don't just hold it" requirement. Depends on the model existing first.

**Independent Test**: Against a fixture roadmap, request the ready-list, the blocked report, and the graph view; verify each matches the declared edges and statuses.

**Acceptance Scenarios**:

1. **Given** a roadmap with mixed statuses, **When** the ready-list is requested, **Then** exactly the items whose hard deps are all `shipped` and with no unmet `deferred-until` are returned.
2. **Given** an item with unmet dependencies, **When** the blocked report is requested, **Then** the item appears with the specific blocking items named.

### User Story 5 - Reconciliation backstop, report-only (Priority: P3)

The operator runs reconciliation; the roadmap flags items whose recorded status disagrees with on-disk reality and *proposes* corrections, but never changes the document on its own.

**Why this priority**: A secondary detection backstop. The roadmap is *intent*; intent must never be silently overwritten by execution state, so this is deliberately advisory.

**Independent Test**: Point reconciliation at a fixture where one item's status disagrees with on-disk state; confirm it reports/proposes the discrepancy and writes nothing.

**Acceptance Scenarios**:

1. **Given** an item marked `in-flight` whose on-disk feature state indicates completion, **When** reconciliation runs, **Then** it reports the discrepancy and proposes advancing the item, and the document is unchanged.
2. **Given** any reconciliation run, **When** it completes, **Then** no roadmap item's recorded status was mutated without an explicit, separate operator action.

### User Story 6 - Migrate the degraded prose roadmap into the canonical governed one (Priority: P2)

The real content of today's degraded prose roadmap (scope, the dependency relationships currently buried in prose notes, sequencing rationale) is migrated into structured items with explicit edges; the prose roadmap is retired to a pointer; the governed roadmap becomes the single canonical source.

**Why this priority**: Resolves the two-roadmaps drift hazard and is the first real dogfood that will surface bugs (which then become `fix` items via US2).

**Independent Test**: After migration, the canonical roadmap contains every real feature from the prose roadmap as a structured item with edges, the prose roadmap is a pointer, and the graph validates.

**Acceptance Scenarios**:

1. **Given** the prose roadmap's content, **When** migration completes, **Then** every real feature is represented as a structured item with its dependencies expressed as edges and the graph validates.
2. **Given** a discrepancy or bug found during migration, **When** it is recorded, **Then** it is captured as a `fix`/`gap` item on the roadmap (not a code comment or lost note).

### Edge Cases

- A dependency **cycle** is introduced → fail loud, name the cycle, write nothing.
- An edge references a **non-existent item** (dangling reference) → fail loud, name the missing target, write nothing.
- A `deferred-until` condition is **unmet** → the item is excluded from the ready-list even if its hard deps are satisfied.
- A **terminal-status** item is still live in the document → flagged for archiving (composes existing curate/archive behavior).
- A **duplicate identifier** is introduced → fail loud (identifier uniqueness invariant).
- A re-decomposition or capture that would leave the graph invalid → refused atomically (no partial write).
- Reconciliation where the **row↔on-disk correspondence is ambiguous** (codename ≠ numbered spec dir) → reported as an unresolved correspondence, never guessed silently. *(See Deferred Decisions.)*

## Requirements *(mandatory)*

### Functional Requirements

**Item model**

- **FR-001**: The roadmap MUST represent each unit of work as an item carrying a stable, human-readable, non-ordinal identifier of the form `<phase>:<kind>/<slug>` (e.g. `impl:fix/roadmap-cycle-detection`), from which `kind` (`feature` / `primitive` / `fix` / `gap`) and `phase` (`design` / `plan` / `impl` / `multi`) are derived; a status from the declared vocabulary (`planned` / `in-flight` / `shipped` / `cancelled` / `retired`); rough scope prose; and typed dependency edges.
- **FR-001a**: Because identity encodes `phase` and `kind`, changing either MUST be done through a first-class `reclassify` operation that renames the item and rewrites every referencing edge atomically (subject to the same graph re-validation and zero-write-on-failure guarantee as all mutations — FR-010). A `<phase>:<kind>` prefix MUST NOT be hand-edited in place (which would orphan edges; FR-005 fails loud on the resulting dangling reference).
- **FR-002**: Items MUST be peers in a single graph (a `fix`/`gap` is a peer node that can block any other item), with an optional non-blocking `part-of` grouping edge to a parent item for readability.
- **FR-002a**: An item MAY carry an optional reference to an external tracker record (a GitHub issue or audit-log finding) as a link. The roadmap is authoritative for sequencing/dependencies only and MUST NOT subsume the issue tracker or the audit-log; the reference is a link, not a mirror.

**Edges & integrity**

- **FR-003**: The roadmap MUST support a hard `depends-on` edge that references another item by identifier and is considered satisfied only when the referenced item is `shipped`.
- **FR-004**: The roadmap MUST support a conditional `deferred-until` edge carrying a **prose-only** condition; it blocks an item's readiness, but its release is an explicit operator judgment (the operator clears the condition when satisfied), never an automatic on-ship event and never auto-evaluated by the tool.
- **FR-005**: Every edge MUST be referential-integrity-checked: an edge to a non-existent item is rejected (fail loud), never written.
- **FR-006**: The `depends-on` graph MUST be acyclic; a cycle is rejected (fail loud) and named, never written.
- **FR-007**: Identifier uniqueness MUST be enforced across items.

**Order**

- **FR-008**: Execution order MUST be *derived* from the dependency graph (a topological order over `depends-on`), tie-broken by the declared phase relation `[design, plan, impl, multi]`. The operator states dependencies; order is computed, not hand-maintained.

**Mutations (the living-document protocol)**

- **FR-009**: The roadmap MUST provide supported operations to add an item, advance an item's status, re-decompose one item into several (rewriting affected edges), `reclassify` an item (change phase/kind, rewriting referencing edges — FR-001a), set a `deferred-until` condition, and archive terminal-status items.
- **FR-010**: Every mutation MUST re-validate the whole graph (referential integrity, acyclicity, identifier uniqueness) and MUST refuse to write a graph that would be left invalid — a validation failure leaves the document byte-for-byte unchanged (zero-write).
- **FR-011**: Emergent work MUST be capturable in a single operation that records kind, `part-of`, and `depends-on` together, so a discovered bug/gap is added with its ordering and blocking relationships intact.

**Query & derived views**

- **FR-012**: The roadmap MUST compute, on demand, the set of *ready* items (all hard deps `shipped` and no unmet `deferred-until`).
- **FR-013**: The roadmap MUST report, for any item, what blocks it (with blocking items named) and what it blocks.
- **FR-014**: The roadmap MUST be able to render a visual of the dependency graph derived from the edges.
- **FR-015**: All derived views MUST be computed from the document at read time; the document remains the single source of truth (views are never a second persisted store).

**Reconciliation (detection backstop)**

- **FR-016**: The roadmap MUST provide a reconciliation operation that compares each item's recorded status against on-disk feature reality and reports/proposes discrepancies. An item declares its on-disk artifact via an explicit, optional correspondence field (e.g. `spec: specs/<dir>`); reconciliation MUST NOT infer correspondence by fuzzy/slug matching. An item with no correspondence field is treated as not-yet-started. An ambiguous or missing correspondence is reported, never guessed.
- **FR-016a**: Reconciliation MUST also perform the reverse check — surfacing on-disk feature artifacts (via the declared `glob`) that have no corresponding roadmap item (orphans to flag).
- **FR-016b**: The on-disk state signal for reconciliation MUST be derived from artifact progression in the linked spec dir: presence of `spec.md` / `plan.md` / `tasks.md`, `tasks.md` completion, and a governance-graduation record (which governance writes into the feature dir) for the `shipped` determination. Reconciliation MUST NOT depend on git/branch-merge state. This signal is advisory input to the report only (FR-017).
- **FR-017**: Reconciliation MUST be report-only: it MUST NOT mutate any item's recorded status without a separate, explicit operator action. (The roadmap records intent; intent is not overwritten by execution state.)

**Enforcement posture**

- **FR-018**: This feature MUST deliver the query/report capability (ready-list, blocked report) now. Hard out-of-order *gating* (mechanically refusing to start work whose dependencies are unmet) is explicitly deferred and MUST itself be captured as a roadmap item rather than silently dropped.

**Canonical source & migration**

- **FR-019**: There MUST be exactly one canonical roadmap; the governed plugin-local roadmap is canonical and the prior prose roadmap is retired to a pointer to it.
- **FR-020**: Migration MUST preserve every real feature from the prior prose roadmap as a structured item with its dependency relationships expressed as edges, and MUST capture any bug/gap discovered during migration as a `fix`/`gap` item.

**Discipline placement**

- **FR-021**: The protocol's discipline MUST live in a skill body and CLI verb (so an adopter receives it from installing the plugin), never in a git hook (per `.claude/rules/enforcement-lives-in-skills.md`).

### Key Entities

- **Work item**: a unit of planned/in-progress/completed work — identifier, kind, status, scope prose, edges. The node of the graph.
- **Dependency edge**: a typed, identifier-referencing relationship between items — `depends-on` (hard, blocking, acyclic), `deferred-until` (conditional, blocking, prose condition), `part-of` (grouping, non-blocking).
- **Roadmap document**: the single governed artifact holding all items; the source of truth; legible to a human and a file-reading agent; diffable in version control.
- **Derived view**: a computed, non-persisted projection (ready-list, blocked report, graph visual).
- **Reconciliation report**: a computed, advisory comparison of recorded status vs on-disk reality; proposes, never applies.

## Settled Architectural Decisions *(do not relitigate)*

These were worked through and decided during brainstorming (full reasoning in the design doc). They are recorded here, in the canonical spec, specifically so future sessions do not re-open them — re-deriving them is the exact "relitigation" cost this feature exists to eliminate.

### Markdown, not a database — and why

The roadmap is stored as a **heading-keyed governed markdown document** (one section per item), **not a database** and not a wide table. The database option was considered explicitly and rejected for *this use case*, for reasons that generalize to every agent-read program artifact:

1. **The primary consumer is a fresh agent reading the file in-context.** An agent reads a markdown document directly and can scan the whole thing to orient. A database (e.g. SQLite) is opaque to a file-reading agent: it must run queries it has to know to run, and cannot eyeball the map. For "describe to an agent how it all fits together," readability-by-reading is close to a hard requirement.
2. **The history *is* the decisions.** The roadmap must live in version control as **diffable text** so "why did this resequence / re-decompose" stays a readable diff. A database is an opaque blob in git; the decision history becomes invisible.
3. **It must survive worktree switches and fresh clones as something legible** — the same reason durable rules live in `.claude/rules/` rather than auto-memory.
4. **It would abandon existing investment.** The 005 document-model engine (`archive`/`curate`/`unarchive` + the heading-keyed/row-keyed grammars) already governs markdown documents; a database forces a separate query layer to do what an agent does today by reading.
5. **The database's benefits are moot at this scale.** Query performance, integrity-at-scale, and concurrent writes do not apply to a single-writer artifact of a few dozen items read in-context. Referential integrity and acyclicity are enforced by a validation pass over a dozen items in milliseconds — they do not need a database engine.

**When a database *would* be the right call** (recorded so the line is explicit): thousands of items, multiple concurrent writers, real-time multi-surface queries, or relational joins across many entity types. None is true here; a text→database migration is straightforward if the roadmap ever crosses that line. Choosing the database now would pay all of its opacity cost to solve problems this artifact does not have (YAGNI; Constitution Principle II).

The generalizable principle: **for artifacts whose primary consumer is an agent reading them in-context and whose history is the decision record, prefer a governed-markdown document over a database.** Queryability is recovered by computing views on demand from the text (FR-012–FR-015) — database-like *querying* without database-like *opacity*.

### Other settled decisions

- **Items are peers**, with optional `part-of` for readable grouping (not nested children).
- **Order is derived** from `depends-on` (topological), tie-broken by the phase relation — not hand-maintained.
- **Reconciliation is report-only** — the roadmap is intent and is never silently overwritten by execution state.
- **Build on the 005 engine** via a generic edge capability (engine-level, reused by any governed doc) plus a roadmap semantic layer; `curate`/`archive` are unchanged.

## Success Criteria *(mandatory)*

- **SC-001**: Given only the roadmap document, a fresh session correctly identifies the next ready item and correctly explains why a named blocked item cannot start — with no operator input.
- **SC-002**: An invalid graph (dangling edge, cycle, or duplicate identifier) is *never* persisted; 100% of mutations that would invalidate the graph leave the document unchanged.
- **SC-003**: A discovered bug/gap is captured as a structured item — with kind, grouping, and dependency relationships — in a single operation.
- **SC-004**: Reconciliation never alters a recorded status without a separate explicit operator action (0 silent mutations across all reconciliation runs).
- **SC-005**: After migration, every real feature from the prior prose roadmap exists as a structured item with its dependencies expressed as edges, and the prior prose roadmap is a pointer to the canonical one.
- **SC-006**: The ready-list and blocked report returned for any roadmap state agree with the declared edges and statuses (no false "ready" while a hard dependency is un-`shipped`).

## Assumptions

- Built on the existing 005 `design/document-primitives` engine; the roadmap grammar, status vocabulary, terminal set, phase order relation, and the declared (currently unexecuted) reconciliation hook already exist and are reused, not rebuilt.
- The governed plugin-local roadmap is canonical; the prose program roadmap is migrated and retired to a pointer.
- Program single-branch convention (`feature/stack-control`) is followed; a per-feature git branch is not created (consistent with specs 001–005).
- The `design:feature/roadmap-protocol` row is seeded by hand at setup (the protocol cannot list itself before it exists); thereafter it self-maintains. (The long-term self-listing mechanism remains a deferred decision.)

## Deferred Decisions (for `/speckit-clarify`)

The `/speckit-clarify` session 2026-06-08 resolved the reconciliation correspondence + truth-source signal, the `deferred-until` representation, and the issues/audit-log relationship (see Clarifications). One genuine fork remains deferred:

1. **Self-listing** — the long-term mechanism for the roadmap to carry its own row beyond the manual seed (and, more broadly, the capture-seam relationship to `design/insight-capture` — the deferred Unit 5). Low-impact for v1; the manual seed is sufficient to start.

## Dependencies

- 005 `design/document-primitives` (shipped): the document-model engine, grammars, and `archive`/`curate`/`unarchive` verbs + skills this feature builds on.
- The roadmap grammar's declared reconciliation hook (the seam this protocol plugs into).
- `.claude/rules/enforcement-lives-in-skills.md`; Constitution Principles I (TDD), II (capture-then-scope), V (no fallbacks / fail-loud), VI (strict typing), VIII (faithful Spec Kit step order).
