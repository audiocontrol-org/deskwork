# Data Model — roadmap edge-mutation and cluster (Phase 1)

No new persistent schema — the roadmap remains the governed `ROADMAP.md` document. These are the in-memory entities the feature operates on.

## WorkItem (existing — `src/roadmap/roadmap-model.ts`)

The typed projection of a roadmap Unit. Relevant fields: `identifier` (`<phase>:<kind>/<slug>`), `status`, `dependsOn: string[]`, `partOf: string | null`, `deferredUntil`, plus lifecycle markers. **`cluster` reads and mutates these via `roadmap-model` + `mutations.ts` only** (FR-006a store-seam discipline). Unchanged by this feature.

> Note: `partOf` is currently modeled as `string | null` (single parent). Per the multi-parent clarification (FR-009), confirm during implementation whether the document-model already supports multiple `part-of` edges per unit (the grammar emits an edge list) and, if the projection collapses to one, widen the projection to `partOf: string[]`. This is a RED-test item, not a new entity.

## ClusterRequest (new — input to the `cluster` verb)

| Field | Type | Notes |
|---|---|---|
| `parentId` | `string` (`<phase>:<kind>/<slug>`) | create-or-reuse (FR-008) |
| `children` | `string[]` (ordered) | existing node ids; order drives `--chain` (FR-010) |
| `chain` | `boolean` | wire `depends-on` `a→b→c` over `children` (FR-010) |
| `summary` | `string \| undefined` | optional parent description on create (FR-008); bare if absent |
| `apply` | `boolean` | dry-run default; write only on `--apply` (FR-011) |

**Validation (pre-write, zero-write on failure — FR-012/013/015):** every `children` id exists; `children` non-empty; `parentId` ∉ `children`; resulting graph acyclic / no dangling / no self-edge; a `part-of` add that exactly duplicates an existing edge is a no-op not an error (FR-009); a `--chain` `depends-on` that conflicts with an existing different `depends-on` on a child REFUSES (FR-014).

## Edge (existing — `part-of`, `depends-on`)

Typed unit-ref edges on a Unit body (`- part-of: <id>`, `- depends-on: <id,...>`). `cluster` adds `part-of` (one per child) and, with `--chain`, `depends-on` edges. Mutated atomically via `rewriteEdgeLine`/`setField` inside one build→validate→write (Decision 2).

## VerbCommandDefinition (new — the non-drift help source)

The `commander` `Command` declaration for `roadmap` (name, summary, sub-commands, each sub-command's options + value vocabularies). It is the **single source** the parser enforces AND `--help`/usage/completion render from (FR-001/005) — there is no separately-maintained help string. The status vocabulary (`planned`/`in-flight`/`shipped`/`cancelled`/`retired`) is declared once here and surfaced in `roadmap advance`/`add` help (FR-004).
