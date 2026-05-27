# LAYOUT — project-side scope-discovery conventions

The scope-discovery protocol scans the adopting project's source tree.
This document describes the conventions the scanners and discovery
agents expect that tree to follow, plus how to override them when the
project's actual layout deviates.

## Default expectations

Most scope-discovery verbs default to `src/` as the **module root** —
the directory whose immediate children are treated as the project's
top-level modules. Within `src/`, an immediate-child directory is
considered a module; `.ts` / `.tsx` files anywhere under it are scanned.

When the project's source tree is shaped differently (a monorepo with
`packages/<pkg>/src/`, a frontend-only `app/src/`, a deno-style flat
tree without any `src/`), the `--module-root` flag overrides the
default. Most scanners accept it; the install command writes it
nowhere — the operator passes it when invoking the verb. Skill prose
documents the flag per verb.

## What "module root" means in practice

Conceptually, the module root is the **outer boundary the protocol
treats as the project's authored surface**. Files outside the module
root are not scanned, even if they live inside the repo:

- `node_modules/`, `dist/`, `build/`, `.next/`, `.turbo/`, `coverage/`
  are always excluded.
- `docs/`, `scripts/`, fixture trees, generated artifacts are excluded
  by virtue of not being under the module root.
- Test files (`*.test.ts`, `*.spec.ts`) are excluded by the jscpd
  config that ships with the bootstrap; the anti-patterns scanner
  honors the registry's `excludes_paths:` field for per-entry
  fine-tuning.

The module-root convention exists because scope-discovery's signal
quality degrades when the scan walks generated, vendored, or
fixture trees. The default of `src/` matches the common TypeScript
project shape; the flag exists for the cases where it doesn't.

## Per-scanner overrides

Each scanner that walks the source tree accepts at least one
override path. The complete list:

| Scanner | Flag | Default |
|---|---|---|
| `check-clones` | jscpd's `pattern:` (in `.jscpd.json`) | `**/*.ts` |
| `check-anti-patterns` | `--root <path>` | `src/` |
| `check-adopters` | `--root <path>` | `src/` |
| `check-refactor-preconditions` | (operates on `clones.yaml` directly) | n/a |
| `check-editor-symmetry` | `--module-root <path>` | `src/` |
| `scope-inventory` | `--module-root <path>` | `src/` |

The CLI defaults are intentionally project-friendly: `--root src/`
works for the largest cohort of TS projects; operators who need to
deviate know to pass the flag.

## Why CONFIG lives at `.dw-lifecycle/scope-discovery/`

THESIS Consequence 3: plugin CODE versus project CONFIG. The
scope-discovery protocol's scanners are CODE — they ship with the
plugin and version with the plugin. The patterns each project considers
"anti", the canonical primitives each project tracks, the clone
baseline the project starts from, all of those are CONFIG. CONFIG
belongs to the adopting project's repo, not to the plugin's release
bundle.

The directory name `.dw-lifecycle/scope-discovery/` is deliberate:

- `.dw-lifecycle/` is the plugin's project-side namespace. Other
  dw-lifecycle features can land siblings (e.g., a future
  `.dw-lifecycle/feature-tracking/`) without naming collisions.
- `scope-discovery/` makes the feature explicit. An operator scanning
  the directory tree sees what's there without reading the plugin's
  source.

## Pattern-matrix overrides — polymorphic catalog

The pattern-matrix discovery agent supports a polymorphic catalog of
pattern types beyond plain regex (Phase 11 Task 1). When the file
`.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml` is present,
its `patterns:` list REPLACES the built-in catalog. Each entry carries
a `type` discriminator selecting the handler:

| `type:` | Behavior |
|---|---|
| `regex` (default — backward-compat for entries without `type:`) | Line-grep regex matcher. |
| `negative-space` | Fires when a file matching `match_glob` does NOT contain `must_contain`. The "expected adopter that didn't adopt" detector. |
| `coverage` | Emits an adoption-ratio metric (`numerator/denominator`). NOT a finding generator. |
| `outlier` | Statistical outlier detection — files whose `distance_metric` distance from directory-sibling centroid exceeds `threshold_sigma`. |
| `semantic` | LLM-augmented (STUB in v1.1; wiring tracked at #319). |

The full schema is at
`plugins/dw-lifecycle/src/scope-discovery/schema/pattern-matrix-patterns.yaml.schema.json`
and an example showing all five types is at
`plugins/dw-lifecycle/templates/scope-discovery/pattern-matrix-patterns.example.yaml`.

## What the protocol does NOT assume

- The project does not have to be a TS monorepo. The default is `src/`
  but the flag exists for every other shape.
- The project does not have to have a single source tree. Operators
  with multi-tree layouts run the scanners with explicit `--root`
  per tree and aggregate findings via standard shell composition.
- The project does not have to use jscpd. `check-clones` uses jscpd
  internally, but the registries (`anti-patterns.yaml`,
  `adopter-manifests.yaml`) are independent of any duplicate-detection
  engine.
