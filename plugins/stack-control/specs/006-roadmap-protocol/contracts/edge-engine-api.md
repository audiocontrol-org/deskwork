# Contract: generic edge capability (document-model engine)

A new, generic extension to `plugins/stack-control/src/document-model/`. Grammar-declared, so any heading-keyed grammar gets edges; `archive`/`curate` are unaffected when a grammar declares no `edgeFields`.

## Types (added to `types.ts`)

```ts
export interface EdgeFieldSpec {
  readonly name: string;                                  // body field label
  readonly references: 'unit' | 'external' | 'prose';     // integrity class
  readonly acyclic: boolean;                              // unit-refs only
  readonly blocking: boolean;                             // semantic hint (engine ignores)
}

export interface Edge {
  readonly field: string;            // EdgeFieldSpec.name
  readonly targets: readonly string[];
}

// GrammarSpec gains:   readonly edgeFields: readonly EdgeFieldSpec[];
// Unit gains:          readonly edges: readonly Edge[];
```

## Functions (new module `edges.ts`)

```ts
// Extract declared edge-fields from a Unit body (lines like `- depends-on: a, b`).
// Pure; does not validate cross-Unit references.
export function extractEdges(body: string, grammar: GrammarSpec): readonly Edge[];

// Validate referential integrity for references:'unit' fields against the doc's
// identifiers. Throws DocumentModelError naming field+source+missing target.
export function assertReferentialIntegrity(units: readonly Unit[], grammar: GrammarSpec): void;

// Validate acyclicity for each acyclic edge-type. Throws DocumentModelError
// naming the cycle. Returns the topological order (Kahn's) for reuse by graph.ts.
export function assertAcyclicAndOrder(
  units: readonly Unit[], grammar: GrammarSpec, edgeField: string,
): readonly string[];
```

## Fail-loud contract (Constitution V / FR-005 / FR-006)

| Condition | Behavior |
|---|---|
| `references:'unit'` target not an existing identifier | `DocumentModelError`: names field, source item, missing target |
| cycle over an `acyclic` edge-type | `DocumentModelError`: names the cycle |
| malformed edge-field line | `DocumentModelError`: located message; never a silent skip |
| no `edgeFields` declared | no edges parsed; identical to pre-feature behavior |

## Integration points

- `document.ts` `loadDocument` populates `Unit.edges` via `extractEdges` after the PEG parse, and runs `assertReferentialIntegrity` (so any consumer — including `curate`/`archive` — loads a referentially-sound document).
- Acyclicity + topological order are invoked by the roadmap semantic layer (`graph.ts`) and by mutation revalidation (`mutations.ts`), reusing `assertAcyclicAndOrder`.
- `ordering.ts` `compareUnits` remains the within-layer tiebreak (phase relation, then identifier).

## Backward compatibility

`design-inbox` (no `edgeFields`) and the legacy row-keyed roadmap parse exactly as before. The capability is additive and opt-in per grammar.
