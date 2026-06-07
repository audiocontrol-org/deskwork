# Phase 1 Data Model: document-primitives

**Feature**: `design/document-primitives` | **Date**: 2026-06-07

Entities are the in-memory + on-disk shapes the engine operates on. Field-level rules reference the canonical FRs in [spec.md](./spec.md) rather than restating them (DRY-for-prose).

## GrammarSpec

The compiled, declared description of a document's structure. Resolved per FR-001 (embedded → project override → built-in default → fail loud) and FR-012.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Grammar identity (e.g. `roadmap`, `design-inbox`); used by frontmatter references. |
| `source` | `'embedded' \| 'project-override' \| 'builtin'` | Where it resolved from (FR-001 precedence). |
| `pegText` | string | The declarative `.peg` grammar text compiled by peggy at runtime. |
| `statusVocabulary` | string[] | All legal statuses (FR-004). |
| `terminalStatuses` | string[] | Subset of `statusVocabulary` that is archivable (FR-004). |
| `orderKey` | OrderKey | Declared ordering; MUST NOT reference the identifier (FR-004). |
| `identifierProduction` | IdentifierRule | The grammar's concrete identifier shape — strict slug or title (FR-005, clarification: per-grammar). |
| `reconciliationHook` | ReconciliationHook \| null | Optional seam (FR-008); null when undeclared. |

- **Rule**: a document with no resolvable `GrammarSpec` is **not governable** → fail loud (FR-001, FR-010).
- **Rule**: `terminalStatuses ⊆ statusVocabulary`; an empty intersection is legal (a document with no terminal statuses simply has nothing to archive).

## GovernableDocument

A parsed markdown document bound to its `GrammarSpec`.

| Field | Type | Notes |
|---|---|---|
| `path` | string | Absolute path to the live markdown file. |
| `archivePath` | string | Sibling `<doc>-archive.md` (derived from `path`). |
| `grammar` | GrammarSpec | The resolved grammar. |
| `units` | Unit[] | Parsed Units in document order (FR-002). |
| `blockLineMap` | Array<[startLine, endLine]> | Normalized-line-index → original markdown line range (research integration pattern). |

- **Rule**: `units` is the result of parsing the normalized block stream against `grammar.pegText`; a parse failure is **not** an empty `units` list — it is a fail-loud error naming the offending span (FR-003, FR-010).

## Unit

A single parsed item — the thing that is ordered, archived, and referenced (FR-002).

| Field | Type | Notes |
|---|---|---|
| `identifier` | string | Stable identity; validated by the invariants below (FR-005). |
| `status` | string | One of `grammar.statusVocabulary` (FR-004). |
| `orderKey` | string \| number \| tuple | Derived per `grammar.orderKey`; never the identifier (FR-004). |
| `span` | `{ startLine, endLine }` | Original markdown line range (FR-002); what archive/curate cut/move. |
| `body` | string (opaque) | The Unit's raw block content; never interpreted by the engine. |

**Identifier invariants (FR-005, enforced as part of well-formedness — FR-003):**

- **Unique** across the document ∪ its archive (so unarchive cannot collide — FR-007).
- **Human-readable**: a single visible name, no parallel opaque token.
- **Non-ordinal**: rejected if it matches the denylist (bare-integer segment; `F<n>`; `phase-<n>`; `step-<n>`; `#<n>`; leading `<n>` numbering). Refinable.
- **Per-grammar shape**: the engine enforces the *properties*; `grammar.identifierProduction` declares the concrete shape (strict slug like `<phase>/<slug>`, or a title). Slug recommended, not mandated (clarification 2026-06-07).
- Any violation → fail loud, zero writes (FR-010).

## ArchiveFile

The sibling document receiving archived Units (FR-006).

| Field | Type | Notes |
|---|---|---|
| `path` | string | `<doc>-archive.md`; created with frontmatter if absent. |
| `archivedUnits` | Unit[] | Appended archived Units; each keeps its identifier as its heading. |
| `ledger` | ProvenanceLedger | Lives **in this file**, not the live document (clarification 2026-06-07). |

- **Rule (coherence — FR-006, SC-007)**: `ledger` entries match `archivedUnits` exactly (one ledger entry per archived Unit, keyed by identifier).

## ProvenanceLedger

The record of what was archived and when (FR-006). Held in the `ArchiveFile`.

| Field | Type | Notes |
|---|---|---|
| `entries` | LedgerEntry[] | One per archived Unit. |

`LedgerEntry`: `{ identifier: string, archivedAt: string (timestamp), fromStatus: string }`. **Keyed by identifier — never by an ordinal range** (FR-006; the explicit departure from ordinal ledgers).

## ReconciliationHook

Optional grammar-declared seam for an external source of truth (FR-008).

| Field | Type | Notes |
|---|---|---|
| `kind` | `'command' \| 'glob'` | Declared shape of the source. |
| `source` | string | The command or glob (recorded, **not executed** this feature). |

- **Rule**: this feature only *records/validates* a declared hook; `curate`'s up-to-date check reports "declared, not yet executed" and **never runs it** (clarification 2026-06-07; execution is a later feature).

## State transitions

A Unit's `status` is authored by the operator in the document; the primitives do **not** change status — they act on it:

```
(operator edits status in the document)
        │
        ▼
status ∈ terminalStatuses ?
   ├─ yes → archive --apply: Unit moves live document → ArchiveFile (+ ledger entry)
   │        unarchive --apply: Unit moves ArchiveFile → live document (− ledger entry)
   └─ no  → stays in the live document; curate keeps it well-ordered
```

Archive and unarchive are inverse operations; an archive→unarchive round-trip restores prior content (FR-007, SC-007). Identity (`identifier`) is invariant across every transition and every reorder (FR-005, SC-004).
