# Phase 0 Research: Roadmap protocol

The design is settled (spec + design doc); this records the technical decisions that resolve the remaining "how" unknowns, each grounded in the existing 005 engine.

## R1 — Edge extraction: generic post-parse body pass vs PEG-embedded

**Decision**: Edges are extracted by a **generic engine pass over each Unit's body**, keyed off the grammar's declared `edgeFields`, NOT hardcoded in each PEG. The PEG continues to produce Units (`identifier`, `status`, `orderValue`, span); a new `edges.ts` reads declared edge-field lines (e.g. `- depends-on: a, b`) from `Unit.body`.

**Rationale**: Keeps the PEG simple (the `design-inbox`/`roadmap` PEGs already only extract identifier + status), makes the capability **generic** (any heading-keyed grammar gets edges by declaring them), and isolates referential-integrity + acyclicity in one auditable module. Matches the architecture's generic/semantic split.

**Alternatives**: embedding edge parsing in the roadmap PEG (rejected — couples the capability to one grammar, duplicates per grammar, and bloats the PEG action block); a separate sidecar edge file (rejected — splits the source of truth, breaks the single-readable-document goal).

## R2 — Field taxonomy: not everything is a Unit→Unit edge

**Decision**: Distinguish three field shapes on a Unit body:

- **Unit-reference edges** (the generic edge capability): `depends-on` (blocking, **acyclic**), `part-of` (non-blocking grouping, **acyclic**). Referential integrity + acyclicity enforced by `edges.ts`.
- **Prose blocking field**: `deferred-until` — a free-text condition (Q4: prose-only). Not a Unit reference; the semantic layer treats a non-empty value as "blocked," operator clears it.
- **External reference fields**: `spec:` (correspondence path, FR-016) and optional `ref:` (issue/finding link, FR-002a). Plain strings; not Unit references, not integrity-checked against Units.

**Rationale**: Only `depends-on`/`part-of` need referential integrity + acyclicity; modeling `deferred-until`/`spec`/`ref` as edges would force them through Unit-reference validation they can't satisfy. The grammar declares each field's shape so the engine knows which to integrity-check.

**Alternatives**: treat all fields as edges (rejected — `deferred-until` is prose, `spec`/`ref` are external; they'd fail referential integrity).

## R3 — Topological order + cycle detection

**Decision**: One **Kahn's-algorithm** pass over the `depends-on` graph yields both the topological order and cycle detection (if the queue empties with nodes remaining, the remainder is a cycle → fail loud naming the cycle). Ties within a topological "layer" are broken by the existing `compareUnits` (phase relation, then identifier) from `ordering.ts`.

**Rationale**: Single pass gives FR-006 (acyclic) and FR-008 (derived order) together; reuses the existing `ordering.ts` tiebreak (phase relation `[design, plan, impl, multi]`), so the order key stays the declared relation.

**Alternatives**: DFS-based topo sort (equivalent; Kahn's makes the "ready frontier" — in-degree-zero set — fall out naturally, which is exactly the next-ready query, FR-012).

## R4 — `next-ready` / `blocked-by` semantics

**Decision**: An item is **ready** iff every `depends-on` target is `shipped` AND it has no non-empty `deferred-until` AND the item itself is non-terminal. `blocked-by(x)` = the `depends-on` targets of `x` that are not `shipped`, plus a "deferred" marker if `deferred-until` is set. `blocks(x)` = items that declare `depends-on: x`. Computed in `graph.ts` over the parsed edges; `part-of` is ignored for readiness (non-blocking).

**Rationale**: Directly implements the spec's "satisfied when target shipped" (FR-003) + prose-deferral block (FR-004). `shipped` is the only satisfying status; `cancelled`/`retired` targets make a dependent permanently blocked (surfaced as such — a real signal, not silently ready).

**Edge note**: a `depends-on` whose target is `cancelled`/`retired` is reported as a blocked/stale dependency (operator likely needs to `reclassify`/re-point), never treated as satisfied.

## R5 — Heading level + identifier production for the roadmap grammar

**Decision**: Heading level **2** (`## <identifier>`); identifier `kind: slug` with the roadmap PEG owning the concrete production `^(design|plan|impl|multi):(feature|primitive|fix|gap)/[^\s/:]+$`. `orderValue` = the phase segment (before `:`); `kind` derived from the segment between `:` and `/`. `statusVocabulary`/`terminalStatuses` unchanged from today's roadmap grammar; `reconciliationHook` (`glob: specs/*/spec.md`) retained.

**Rationale**: Mirrors `design-inbox.peg` (heading-keyed, level 3) — reuses the proven heading path. Level 2 reads as document sections with level-3 sub-structure available inside an item's body. The PEG owns its concrete identifier shape exactly as the current row-keyed `roadmap.peg` owns its `CODENAME` regex (engine enforces only universal identifier properties — FR-005/identifier-validator).

**Alternatives**: level 3 (rejected — leaves `#`/`##` as document chrome only; level 2 gives items first-class section status and room for `###` sub-notes in a body).

## R6 — GrammarSpec extension shape (how edge-fields are declared)

**Decision**: Add an optional `edgeFields` block to the grammar YAML metadata, parsed by `grammar-resolver.ts` into a new `EdgeFieldSpec[]` on `GrammarSpec`. Each entry: `name` (e.g. `depends-on`), `references: unit | external` (Unit-reference vs external string), `acyclic: bool`, `blocking: bool`. `Unit` gains a parsed `edges`/`fields` structure populated by `edges.ts`. Absent `edgeFields` = today's behavior (no edges) — backward compatible with the `design-inbox` grammar.

**Rationale**: Declarative, single-sourced in the grammar artifact (consistent with how `unit`/`orderKey`/`reconciliationHook` are already declared), and optional so existing grammars are unaffected (`curate`/`archive` keep working).

**Alternatives**: hardcode edge-field names in `edges.ts` (rejected — not grammar-driven, not generic); a separate edge-config file (rejected — splits the grammar's single source of truth).

## R7 — Mutation atomicity (zero-write on failure)

**Decision**: Every mutation (`add`/`advance`/`decompose`/`reclassify`/`defer`/`archive`) follows `curate`'s established pattern: compute the new document in memory, **re-parse + re-validate the whole graph** (identifier uniqueness, referential integrity, acyclicity) BEFORE any write, and only then write via the existing `atomicWriteFile` path. A validation failure leaves the document byte-for-byte unchanged (FR-010). `archive` composes the existing `archive-engine` (terminal items out + ledger).

**Rationale**: Reuses the exact preflight-before-write discipline `curate-engine.ts` already implements (`preflightArchive` before the reorder write); no new atomicity mechanism.

## R8 — Mermaid view

**Decision**: `views.ts` emits a mermaid `flowchart` from the `depends-on` edges (node per item labeled `identifier` + status glyph; edge per `depends-on`). Derived on demand, never persisted (FR-015).

**Rationale**: Mermaid is text, fits the "storage stays text, views computed" decision, and renders in the studio/markdown surfaces already in the repo.

## R9 — Migration (US6) approach

**Decision**: Migration is a one-time authored port (like 005's `DESIGN-INBOX.md` lossless migration): read the prose `docs/1.0/.../stack-control-roadmap.md` + the current row-keyed `ROADMAP.md`, author the heading-keyed canonical `ROADMAP.md` with explicit `depends-on` edges derived from the prose's dependency notes, validate the graph green, then retire the prose roadmap to a pointer. Discrepancies/bugs found become `fix`/`gap` items (FR-020). A test asserts every real feature from the prose roadmap is present as an item.

**Rationale**: The migration is the first real dogfood (design doc Decision 5); authoring it by hand under a presence-test mirrors the proven 005 migration pattern.

## Resolved unknowns

No `NEEDS CLARIFICATION` remain. The one spec-level deferred fork (self-listing mechanism) is out of v1 scope and does not block the plan (manual seed suffices).
