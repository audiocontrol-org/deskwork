# Contract: grammar declaration & resolution

How a document becomes **governable** (FR-001, FR-012). This is the contract every governable document and every grammar author conforms to.

## Resolution (per document, fail-loud, no fallback)

The engine resolves a document's grammar in this order; the first hit wins:

1. **Embedded** — an HTML comment block in the document declaring the grammar inline:
   ```
   <!-- doc-grammar: peg
   <peg grammar text…>
   -->
   ```
2. **Frontmatter reference** — `doc-grammar: <id>` in the document's frontmatter, resolved against:
   1. project override `.stack-control/grammars/<id>.peg`, then
   2. built-in default `plugins/stack-control/grammars/<id>.peg`.
3. **Neither present** → **fail loud**: `document declares no grammar; not governable` (exit non-zero, zero writes).

When both an embedded block and a frontmatter reference exist, **embedded wins** (precedence is fixed, not a merge).

## Grammar obligations

A grammar (`.peg` text) is **trusted local config** compiled and run in-process (spec Assumptions — grammar trust model; same model as `.deskwork/*.ts` overrides). It MUST declare, in a form the engine can extract:

- the **Unit production** (what a unit is + its boundaries over the block stream). The Unit MUST be delimited by a **structural marker a Unit body provably cannot contain** (FR-002 boundary rule): a heading-keyed grammar **reserves its Unit-heading level** (bodies carry only strictly-deeper headings; a reserved-level heading always starts a new Unit), a row-keyed grammar uses the table row. This is what makes the Unit's `span` — and later its archive-file extraction (FR-006/FR-007) — unambiguous;
- the **status vocabulary** and the **terminal (archivable) subset** (FR-004);
- the **order key** — expressible over status + human-readable fields, **never** a positional/sequence ordinal (ordering by a category/attribute that also appears in a structured identifier, e.g. roadmap by `phase`, is allowed) (FR-004);
- the **identifier production** — a strict slug (`<phase>/<slug>`, recommended) or a title; the engine enforces the FR-005 properties regardless of shape;
- optionally, a **reconciliation hook** (`kind: command|glob`, `source`) — recorded, not executed (FR-008).

## Engine guarantees to the grammar author

- A malformed grammar produces a **clean, located error** (never a crash) — FR-003/FR-010 (research risk #3).
- The engine **excises its own chrome before the grammar runs** — the embedded grammar-declaration comment (the HTML comment beginning with the `doc-grammar:` sentinel, FR-001) and the document frontmatter are stripped from the block stream by a pre-parse step (FR-002), so the grammar never sees and never has to account for them. Other HTML comments are ordinary blocks the grammar sees.
- Prose bodies are **opaque** — the grammar matches block structure, not body prose (FR-002).
- Identifier-invariant violations are reported against the offending Unit (FR-005).

## Built-in grammars shipped this feature

- `roadmap.peg` — `<phase>/<slug>` identifiers; full status vocabulary `planned`, `in-flight` (active), `shipped`, `cancelled`, `retired` (terminal) (proof instance #2, FR-013).
- `design-inbox.peg` — title identifiers; full status vocabulary `captured` (active), `promoted`, `dropped` (terminal) (proof instance #1, FR-013).
