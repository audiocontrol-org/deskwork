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

A grammar (`.peg` text) MUST declare, in a form the engine can extract:

- the **Unit production** (what a unit is + its boundaries over the block stream);
- the **status vocabulary** and the **terminal (archivable) subset** (FR-004);
- the **order key** — expressible over status + human-readable fields, **never** the identifier (FR-004);
- the **identifier production** — a strict slug (`<phase>/<slug>`, recommended) or a title; the engine enforces the FR-005 properties regardless of shape;
- optionally, a **reconciliation hook** (`kind: command|glob`, `source`) — recorded, not executed (FR-008).

## Engine guarantees to the grammar author

- A malformed grammar produces a **clean, located error** (never a crash) — FR-003/FR-010 (research risk #3).
- Prose bodies are **opaque** — the grammar matches block structure, not body prose (FR-002).
- Identifier-invariant violations are reported against the offending Unit (FR-005).

## Built-in grammars shipped this feature

- `roadmap.peg` — `<phase>/<slug>` identifiers; full status vocabulary `planned`, `in-flight` (active), `shipped`, `cancelled`, `retired` (terminal) (proof instance #2, FR-013).
- `design-inbox.peg` — title identifiers; full status vocabulary `captured` (active), `promoted`, `dropped` (terminal) (proof instance #1, FR-013).
