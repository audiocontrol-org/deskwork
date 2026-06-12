# Phase 0 Research: parser technology for document grammars

**Feature**: `design/document-primitives` | **Date**: 2026-06-07

The spec deferred one unknown to planning: the concrete grammar/parser technology (committing only to "a formal grammar compiled to a real parser over the markdown block stream"). This document resolves it. All maintenance/API claims were verified against current documentation (June 2026), not memory.

## Decision

**Grammar→parser: `peggy` (v5.x).** **Markdown block parser: `markdown-it`.** **Integration: a normalized one-token-per-line block representation** that a declarative `.peg` grammar parses, with a parallel map from normalized lines back to original markdown line ranges.

### Rationale

- **peggy satisfies the load-bearing constraint** (FR-001): grammars are a **declarative `.peg` text artifact** the document author writes — embeddable in an HTML comment or stored at `.stack-control/grammars/<id>.peg` — and compiled at runtime via `peggy.generate(grammarText)`. It is unambiguously maintained (v5.1.0, ~1 month old; explicit PEG.js successor) and exposes **line-native spans** through `location()` (`{start:{line}, end:{line}}`), which the `archive` cut-by-span step needs directly (no offset→line conversion).
- peggy is **string-input only** — it cannot consume a token array. This is dissolved by the **normalization pattern**: the markdown block stream is serialized to one compact line per block (block-kind + salient fields, prose bodies opaque), and the grammar matches over that line-oriented text. Running a string PEG over a normalized token text is a standard, sound technique and keeps prose bodies opaque exactly as FR-002 requires.
- **markdown-it** is chosen over remark/mdast and micromark because its block tokens already carry `token.map = [startLine, endLine]` — a **flat, block-level, line-numbered** stream, the closest existing shape to "stream of blocks," with line ranges that drop straight into the Unit span requirement (FR-002).

### Integration pattern (the pipeline of FR-002)

1. `markdown-it` `md.parse(src, {})` → flat block-token array; for each block-level token read `token.map = [startLine, endLine]`.
2. Emit **one normalized line per block** encoding only what the grammar matches on (block kind + e.g. heading text / status marker); keep a parallel array: normalized-line-index → original `[startLine, endLine]`.
3. Resolve + compile the declared grammar (`peggy.generate`) and parse the normalized text → Units with identifier, status, orderKey, and a span in normalized-line coordinates.
4. Map each Unit's normalized span back through the parallel array to its **original markdown line range** → the span used by archive/curate to cut/move blocks.

## Alternatives considered

| Option | Maintained | Declarative grammar file (FR-001) | Token-stream input | Line spans | Verdict |
|---|---|---|---|---|---|
| **peggy** | Yes (v5.1.0, ~1mo) | **Yes** (`.peg` text) | No (string only) | **Yes, line-native** | **Chosen** — only option meeting FR-001 + maintained + line spans; string-only resolved by normalization. |
| ohm-js | Maintained, thinner (17.5.0 stable; v18 beta API in flux) | Yes (`.ohm`) | No (string only) | Offsets, not lines (extra step) | Rejected — v18 churn risk + offset→line conversion + heavier grammar+semantics two-artifact model. |
| chevrotain | Yes | **No** (grammar is TypeScript code) | **Yes** (native token vector) | Yes | Rejected on FR-001 — the document author cannot write a TS-code grammar. (Would be the natural pick *if* the "document declares its own grammar" requirement were ever dropped.) |

Markdown block parser alternatives: **remark/mdast** (nested tree; positions present but needs flattening — reasonable fallback if richer block typing is later needed) and **micromark** (lower-level; would re-derive block boundaries — overkill). markdown-it's flat line-ranged block tokens are the closest fit.

## Risks to prove RED-first in implementation

1. **The normalization round-trip is the load-bearing seam (research risk #1).** First failing test: for an N-block document, a grammar-matched Unit maps back to the **exact original markdown line range**, across blocks markdown-it splits/merges unexpectedly (loose vs tight lists, fenced code with blank lines, setext headings, tables, HTML blocks). An off-by-one in the parallel index map makes every span — and every cut — wrong; the classic bug that passes the golden path and breaks on the second real document (so it is exercised against both proof grammars).
2. **`token.map` coverage** — verify on real fixtures that every block kind the grammar must span (nested list items, table rows) carries a non-null `map`; some inline/edge tokens have `map = null`.
3. **Grammar-as-untrusted-input** — the grammar is author-supplied; `peggy.generate` runs on it at runtime. Prove RED-first that a malformed grammar (and a parse failure) yields a clean, **located** error (FR-003/FR-010 fail-loud), never a crash.

## Sources

peggy ([npm](https://www.npmjs.com/package/peggy), [docs](https://peggyjs.org/documentation.html), [GitHub](https://github.com/peggyjs/peggy)); ohm-js ([npm](https://www.npmjs.com/package/ohm-js), [v18 beta](https://ohmjs.org/blog/ohm-v18)); chevrotain ([breaking changes](https://chevrotain.io/docs/changes/BREAKING_CHANGES), [parsing tutorial](https://chevrotain.io/docs/tutorial/step2_parsing.html)); markdown-it ([API](https://markdown-it.github.io/markdown-it/), [token.map #821](https://github.com/markdown-it/markdown-it/issues/821)); [mdast-util-from-markdown](https://www.npmjs.com/package/mdast-util-from-markdown); [micromark](https://www.npmjs.com/package/micromark).
