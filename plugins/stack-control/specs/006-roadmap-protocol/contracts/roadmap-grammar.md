# Contract: heading-keyed `roadmap` grammar artifact

Replaces today's row-keyed `plugins/stack-control/grammars/roadmap.peg`. The grammar is the contract `archive`/`curate`/`roadmap` operate through — it MUST describe the target structure before the primitives work on it.

## Metadata header (YAML)

```yaml
---
id: roadmap
unit:
  kind: heading
  level: 2
statusVocabulary: [planned, in-flight, shipped, cancelled, retired]
terminalStatuses: [shipped, cancelled, retired]
orderKey:
  field: phase
  relation: [design, plan, impl, multi]
identifier:
  kind: slug
edgeFields:                 # NEW (R6) — declares which body fields are edges/refs
  - { name: depends-on,     references: unit,     acyclic: true,  blocking: true  }
  - { name: part-of,        references: unit,     acyclic: true,  blocking: false }
  - { name: deferred-until, references: prose,    acyclic: false, blocking: true  }
  - { name: spec,           references: external, acyclic: false, blocking: false }
  - { name: ref,            references: external, acyclic: false, blocking: false }
reconciliationHook:
  kind: glob
  source: "specs/*/spec.md"
---
```

`statusVocabulary`/`terminalStatuses`/`orderKey`/`reconciliationHook` are unchanged from the current roadmap grammar. `edgeFields` is new and optional engine-wide (absent ⇒ no edges; backward-compatible with `design-inbox`).

## PEG body (heading-keyed)

- Mirrors `design-inbox.peg` structure (preamble / `unit*` / postamble) but reserves heading **level 2**.
- `unit` = `## <identifier>` head + body lines until the next `##` (a shallower `#` inside the unit sequence is fail-loud leftover input, per the design-inbox two-region model).
- Identifier production (PEG-owned, FR-005): `^(design|plan|impl|multi):(feature|primitive|fix|gap)/[^\s/:]+$`. A non-conforming `## heading` is a parse failure (engine fails loud).
- `orderValue` = the phase segment (before `:`).
- Status from a body field `- status: <s>` (lower-cased).

## Document shape (one item per section)

```markdown
---
doc-grammar: roadmap
---

# stack-control — roadmap

<intro preamble — not a Unit>

## impl:feature/execution-engine
- status: planned
- depends-on: design:feature/document-primitives, multi:feature/front-door
- spec: specs/002-parallel-execution-engine
Parallel multi-backend execution engine. Worktree-isolated, capability-selected.

## impl:fix/roadmap-cycle-detection
- status: planned
- part-of: design:feature/roadmap-protocol
- depends-on: design:feature/roadmap-protocol
- ref: "#NNN"
Found while dogfooding: a dependency cycle must fail loud.
```

## Engine guarantees over a roadmap document

- Parse → Units with parsed `edges` (depends-on/part-of as unit refs; deferred-until/spec/ref as prose/external).
- Referential integrity: every `depends-on`/`part-of` target exists (else fail loud).
- Acyclicity: `depends-on` and `part-of` graphs are acyclic (else fail loud).
- `curate` (unchanged) keeps the doc well-formed/ordered/archived; ordering uses the phase relation.
- `archive` (unchanged) relocates terminal-status sections + ledger entry.

## Migration note

The current row-keyed `roadmap.peg` + table-form `ROADMAP.md` remain valid until US6 ports content into this heading-keyed canonical document; the row-keyed grammar is retired once migration is green.
