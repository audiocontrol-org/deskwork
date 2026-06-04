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
| `check-module-symmetry` | `--module-root <path>` | `src/` |
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
pattern types beyond plain regex (polymorphic pattern handlers). When the file
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

## Content type support

multi-content-type support generalized the scan engine beyond TypeScript. The
pattern catalog + glob + shape model is content-type-agnostic; the same
primitives operate uniformly on every content type listed below.

| Extension | Walker support | Outlier `content_type:` token unit |
|---|---|---|
| `.ts` / `.tsx` | yes (default) | `ts` — alphanumeric identifiers |
| `.md` / `.markdown` | yes (NEW multi-content-type support) | `markdown` — alphanumeric words |
| `.css` / `.scss` | yes (NEW multi-content-type support) | `css` — property names + class/id selectors |
| `.html` / `.htm` | yes (NEW multi-content-type support) | `html` — tag names + attribute names |
| `.yaml` / `.yml` | yes (NEW multi-content-type support) | `yaml` — top-level + nested key names |
| `.json` | yes (NEW multi-content-type support) | `json` — JSON key names |

### How extension support actually works

The `pattern-matrix` agent reads the catalog and derives the **union**
of every entry's `extensions:` field. The file walker then traverses
every file whose extension is in that union (plus the default `.ts/.tsx`).
A catalog with zero `extensions:` declarations walks only TS files;
adding `extensions: ['.md']` to even one entry expands the walk to
include markdown files for every entry that day.

The per-entry `extensions:` filter still applies at evaluation time —
a regex entry declaring `extensions: ['.md']` will skip non-`.md` files
even if the walker handed them in. This lets a single catalog mix per-
content-type patterns without bleeding across content types.

### Authoring per-content-type entries

Every pattern type in the catalog accepts an optional `extensions:`
filter. The recommended shape for content-type-specific entries:

```yaml
patterns:
  # Markdown-specific anti-pattern:
  - type: regex
    id: markdown-setext-heading-retired
    description: 'Setext-style headings are retired in favor of ATX `#`.'
    regex: '^={3,}\s*$'
    extensions: ['.md', '.markdown']

  # CSS-specific negative-space detection:
  - type: negative-space
    id: css-without-canonical-namespace
    description: 'CSS files lacking the `.ac-*` namespace prefix.'
    match_glob: 'src/**/*.css'
    must_contain: '\.ac-[a-z]'
    threshold: 1
    extensions: ['.css', '.scss']

  # JSON-schema coverage metric:
  - type: coverage
    id: package-license-adoption
    description: 'Fraction of package.json files carrying a `license` field.'
    match_glob: 'packages/**/package.json'
    must_contain: '"license"\s*:\s*"'
    extensions: ['.json']
```

### Outlier `content_type:` discriminator

The `outlier` primitive's `token-composition` distance metric tokenizes
file content. Different content types call for different tokenizers:
markdown words are not TypeScript identifiers, CSS selectors are not
YAML keys. The `content_type:` field selects the tokenizer:

| Value | Tokenizer |
|---|---|
| `auto` (default) | Inferred from file extension (see table above). Unknown extensions fall back to `ts` (alphanumeric tokens). |
| `ts` | Alphanumeric identifier tokens (length ≥ 3, lowercased). |
| `markdown` | Alphanumeric word tokens (shares the `ts` tokenizer today; explicit dispatcher leaves room for per-content tuning). |
| `css` | Property names + `.class`/`#id` selectors. |
| `html` | Tag names + attribute names. |
| `yaml` | Top-level + nested key names (per `^name:` regex). |
| `json` | JSON key names (per `"name":` regex). |

The `className-composition` distance metric is JSX-specific (parses
`className="..."` attribute payloads). For non-TS content the operator
should pick `token-composition` with an appropriate `content_type:`
instead. See `pattern-matrix-patterns.example.yaml` for end-to-end
examples for each content type.

### Limitations + practical guidance

- **Glob semantics.** The handlers' glob compiler treats `**` as
  "one or more path segments" (matches `pages/sub/a.html` but NOT
  `pages/a.html`). Author globs accordingly — use
  `pages/**/*.html` for nested layouts, `pages/*.html` for flat ones.
- **Outlier needs population.** The outlier handler buckets files by
  parent directory and skips buckets with fewer than 2 siblings. A
  population of N=1 produces zero findings even if the file is
  visually divergent. Layout fixtures with at least 2 siblings per
  directory to exercise the primitive.
- **Outlier needs variance.** A directory of byte-identical files has
  zero standard deviation; the handler skips it (the alternative
  would be noise). Real codebases supply natural variance; synthetic
  test fixtures should vary the siblings slightly (a single extra
  key, an extra property) to keep stddev > 0.
- **The synthesis layer + operator curate.** Per-content-type regexes
  are heuristics, not parsers. False positives at the discovery layer
  are cheaper than false negatives; the synthesis layer + operator
  triage.

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
