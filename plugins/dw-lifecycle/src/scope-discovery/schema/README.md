## scope-discovery JSON Schemas

Machine-readable specs of the YAML wire formats produced and consumed by the scope-discovery layer. Adopter editors can reference these for autocomplete + inline validation; the Phase 9 doctor rules consume them as the authoritative shape contract.

| File | Spec for | Authoritative validator (runtime) |
|---|---|---|
| `clones.yaml.schema.json` | `docs/scope-discovery/clones.yaml` | `../clones-yaml.parse.ts` + `../clones-yaml.refactor.ts` (`validateRefactorPreconditions`) |
| `anti-patterns.yaml.schema.json` | `docs/scope-discovery/anti-patterns.yaml` | `../anti-patterns-registry.ts` (`parseEntry`) |
| `adopter-manifests.yaml.schema.json` | `docs/scope-discovery/adopter-manifests.yaml` | `../adopter-manifests-registry.ts` (`parseEntry`) |

Phase 3 adds `annotated-trace.json.schema.json`.

The runtime parsers are SSOT. When a schema and the parser disagree, the parser wins; update the schema to match in the same commit.
