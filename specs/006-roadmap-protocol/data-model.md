# Phase 1 Data Model: Roadmap protocol

Field-level rules trace to the canonical FRs in `spec.md` (referenced, not restated — DRY-for-prose). New engine types extend the existing `plugins/stack-control/src/document-model/types.ts`; roadmap-semantic types live in `src/roadmap/`.

## Engine-level (generic, in `document-model/`)

### EdgeFieldSpec *(new — declared by a grammar)*

How a grammar declares that a body field is an edge/reference (R6).

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | The body field label, e.g. `depends-on`, `part-of`, `spec`, `ref`, `deferred-until`. |
| `references` | `'unit' \| 'external' \| 'prose'` | `unit` = referential-integrity-checked against Unit identifiers; `external` = free string (path/URL/id); `prose` = free text (e.g. `deferred-until`). |
| `acyclic` | `boolean` | Only meaningful for `references: 'unit'`; when true a cycle over this edge-type fails loud (FR-006). |
| `blocking` | `boolean` | Semantic hint consumed by the roadmap layer (depends-on/deferred-until block readiness; part-of does not). The engine does not interpret blocking. |

Declared in grammar YAML metadata as an optional `edgeFields` list. Absent ⇒ no edges (backward-compatible with `design-inbox`).

### GrammarSpec *(extended)*

Add `readonly edgeFields: readonly EdgeFieldSpec[]` (empty when undeclared). All existing fields unchanged.

### Edge *(new — a parsed reference on a Unit)*

| Field | Type | Notes |
|---|---|---|
| `field` | `string` | The `EdgeFieldSpec.name` this came from. |
| `targets` | `readonly string[]` | For `references: 'unit'` — referenced identifiers (validated to exist). For `external`/`prose` — the raw value(s) as a single-element list. |

### Unit *(extended)*

Add `readonly edges: readonly Edge[]` (parsed by `edges.ts` from the Unit body per the grammar's `edgeFields`). Existing `identifier`/`status`/`orderValue`/`span`/`body` unchanged. The roadmap's `orderValue` is the **phase** segment of `<phase>:<kind>/<slug>`.

### Validation (engine, fail-loud — `edges.ts`)

- **Referential integrity (FR-005)**: every `references: 'unit'` target MUST be an identifier of some Unit in the same document; a dangling target → `DocumentModelError` naming the field, the source item, and the missing target.
- **Acyclicity (FR-006)**: the directed graph over each `acyclic` edge-type MUST be acyclic; a cycle → `DocumentModelError` naming the cycle.
- **Identifier uniqueness (FR-007)**: enforced by the existing identifier path; edges rely on it.
- `external`/`prose` fields are NOT integrity-checked against Units.

## Roadmap-semantic level (in `src/roadmap/`)

### WorkItem *(view over a Unit)*

A typed projection of a roadmap Unit for the semantic layer.

| Field | Type | Source |
|---|---|---|
| `identifier` | `string` | Unit identifier `<phase>:<kind>/<slug>`. |
| `phase` | `'design' \| 'plan' \| 'impl' \| 'multi'` | Parsed before `:`. |
| `kind` | `'feature' \| 'primitive' \| 'fix' \| 'gap'` | Parsed between `:` and `/`. |
| `status` | status-vocabulary value | Unit status. |
| `dependsOn` | `readonly string[]` | `depends-on` edge targets. |
| `partOf` | `string \| null` | `part-of` edge target (grouping; non-blocking). |
| `deferredUntil` | `string \| null` | prose condition; non-null ⇒ blocks readiness. |
| `spec` | `string \| null` | correspondence path (FR-016). |
| `ref` | `string \| null` | optional issue/finding link (FR-002a). |
| `scope` | `string` | the item's shape prose (body, sans fields). |

### Identity & lifecycle

- **Identity** encodes `phase` + `kind`; changing either is a `reclassify` op that renames + rewrites referencing edges atomically (FR-001a). Identity is otherwise stable (non-ordinal, unique, human-readable — engine-enforced).
- **Status lifecycle**: `planned → in-flight → shipped` (forward), with `cancelled`/`retired` terminal; `shipped`/`cancelled`/`retired` are the terminal/archivable set (unchanged from today's grammar). `advance` moves status; `archive` relocates terminal items (composes `archive-engine`).

### Derived (not persisted — `graph.ts`/`views.ts`)

| View | Definition |
|---|---|
| `ready` | items: every `dependsOn` target is `shipped`, `deferredUntil` is null, item is non-terminal (FR-012). |
| `blockedBy(x)` | non-`shipped` `dependsOn` targets of `x` (+ a `deferred` marker if `deferredUntil` set) (FR-013). |
| `blocks(x)` | items whose `dependsOn` includes `x` (FR-013). |
| `order` | topological over `depends-on`, tie-broken by phase relation then identifier (FR-008). |
| `mermaid` | flowchart from `depends-on` edges (FR-014). |

### ReconciliationReport *(advisory — `reconcile.ts`)*

| Field | Type | Notes |
|---|---|---|
| `statusDrift` | `{ identifier, recorded, onDisk, proposal }[]` | item status vs artifact-progression signal at the `spec:` path (FR-016/016b). |
| `orphans` | `string[]` | spec dirs (via the glob) with no roadmap item (FR-016a). |
| `unresolved` | `string[]` | items whose `spec:` is ambiguous/missing where a feature was expected — reported, never guessed. |

Reconciliation **proposes only**; it never mutates a status (FR-017).

## State transitions (mutations — `mutations.ts`)

All mutations re-parse + re-validate the full graph before writing; failure ⇒ zero write (FR-010, R7).

| Mutation | Effect |
|---|---|
| `add` | insert a new item (kind/phase via identifier; optional edges) — one-move emergent capture supports `--part-of`/`--depends-on` together (FR-011). |
| `advance` | change status along the lifecycle. |
| `decompose` | replace one item with N; resolve what former dependents now point at; re-validate (FR-009). |
| `reclassify` | change phase/kind ⇒ rename identifier + rewrite all referencing edges atomically (FR-001a). |
| `defer` | set/clear the `deferred-until` prose condition. |
| `archive` | move terminal-status items to the archive companion (composes `archive-engine` + ledger). |
