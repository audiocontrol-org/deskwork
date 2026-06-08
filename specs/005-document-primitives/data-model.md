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
| `orderKey` | OrderKey | Declared ordering; MUST NOT be a positional/sequence ordinal (a category/attribute that also appears in a structured identifier is allowed). Ties on equal order-key values are broken **by identifier** — a stable, total secondary sort, not a positional encoding (FR-004). |
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
| `orderKey` | string \| number \| tuple | Derived per `grammar.orderKey`; never a positional/sequence ordinal (FR-004). |
| `span` | `{ startLine, endLine }` | Original markdown line range (FR-002); what archive/curate cut/move. Bounded by the grammar's **reserved structural marker** — a Unit runs from its marker to the next same-level marker (FR-002 Unit boundary rule). |
| `body` | string (opaque) | The Unit's raw block content; never interpreted by the engine. Provably cannot contain the grammar's reserved Unit marker (reserved heading level / row), which is what makes the boundary unambiguous (FR-002). |

**Identifier invariants (FR-005, enforced as part of well-formedness — FR-003):**

- **Unique** across the document ∪ its archive (so unarchive cannot collide — FR-007). Archived identifiers for the union come from the **`ProvenanceLedger` only** (keyed by identifier), never from a heading scan of the `ArchiveFile` (a Unit body may contain headings, so a scan can't tell a Unit-identifier marker from a body heading without a forbidden archive parse → false collisions). An empty ledger / absent archive means the union is just the live document; a corrupt archive is surfaced via the coherence check, not a live parse (FR-005, FR-006).
- **Human-readable**: a single visible name, no parallel opaque token.
- **Non-ordinal**: rejected if it **is a positional/sequence index** (not merely if it begins with a digit). Closed v1 denylist: `F<n>`; `phase-<n>`; `step-<n>`; `#<n>`; a bare integer that is the entire identifier (e.g. `2`); a leading enumeration marker (`1.`, `3)`). A prose title that starts with a number (e.g. `3 ways to industrialize execution`) is allowed. Refinable (FR-005).
- **Per-grammar shape**: the engine enforces the *properties*; `grammar.identifierProduction` declares the concrete shape (strict slug like `<phase>/<slug>`, or a title). Slug recommended, not mandated (clarification 2026-06-07).
- Any violation → fail loud, zero writes (FR-010).

## ArchiveFile

The sibling document receiving archived Units (FR-006).

| Field | Type | Notes |
|---|---|---|
| `path` | string | `<doc>-archive.md`; created with frontmatter if absent. |
| `archivedUnits` | Unit[] | Appended archived Units; each delimited by the **same reserved-level structural marker** as the live document (FR-002 boundary rule) — reserved-level sections for a heading-keyed grammar, or rows in a **single archived-Unit table reproducing the live document's header + separator + column schema** for a row-keyed grammar — so a Unit spans from its identifier marker to the next same-level marker, unambiguous because bodies cannot contain that marker. |
| `ledger` | ProvenanceLedger | Lives **in this file**, not the live document (clarification 2026-06-07), in its **own distinct section** (HTML-comment block or heading) **separate from the Unit table/sections** so a scanner never confuses ledger rows with Unit rows (FR-006). |

- **Rule (coherence — FR-006, SC-007)**: `ledger` entries match `archivedUnits` exactly (one ledger entry per archived Unit, keyed by identifier). The coherence check cross-references each ledger identifier against the archive file's identifier markers — this is the **only** use of the archive heading scan.
- **Rule (uniqueness union source — FR-005)**: archived identifiers feeding the document ∪ archive uniqueness union come from the **`ledger` only** (keyed by identifier), **not** from a heading scan and **not** by parsing the archive against the live grammar. An empty ledger contributes nothing to the union; a corrupt archive is surfaced via the coherence check rather than failing the live parse.
- **Rule (extraction — FR-007)**: a ledger entry (keyed by identifier) is sufficient to locate a Unit for unarchive — the engine scans the archive file for the matching identifier marker and reads to the next same-level marker. **No span/position is stored**; the boundary is structural.

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

- **Rule**: this feature only *records/validates* a declared hook; `curate`'s up-to-date check reports "declared, not executed" and **never runs it** (clarification 2026-06-07; execution is out of scope for this feature — a separate feature owns it).

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

Archive and unarchive are inverse operations; an archive→unarchive round-trip is content-equivalent and well-ordered — the Unit returns with body and identity intact, reinserted at its declared-order position, not byte-identical (FR-007, SC-007). Identity (`identifier`) is invariant across every transition and every reorder (FR-005, SC-004).
