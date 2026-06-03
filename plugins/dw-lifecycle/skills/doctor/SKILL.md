---
name: doctor
description: "Audit binding metadata + scope-discovery state across calendar/journal/docs/issues; opt-in --fix"
---

# /dw-lifecycle:doctor

Read-only audit (default) or opt-in repair (`--fix=<rule>`) of binding metadata and scope-discovery state.

## Steps

1. Shell out to the helper:

```
dw-lifecycle doctor [--fix=<rule>] [--yes]
```

The helper currently runs these rules:
- `missing-config` — no `.dw-lifecycle/config.json`
- `peer-plugins` — `superpowers` (required) or `feature-dev` (recommended) missing
- `version-shape-drift` — docs version directory exists on disk but is absent from `config.docs.knownVersions`
- `orphan-feature-doc` — in-progress feature directory exists without `workplan.md`
- `stale-issue` — feature is still in the in-progress doc tree but its parent issue is already closed
- `journal-feature-mismatch` — configured journal references a feature slug with no matching doc directory

The helper also runs the scope-discovery rules (next section).

2. Display findings grouped by severity (error / warning).
3. For `--fix=<rule>`, prompt operator before each repair (unless `--yes`).

## Scope-discovery rules

When the project has opted into scope-discovery (`.dw-lifecycle/scope-discovery/` present), the doctor extends its rule list with eight scope-discovery-specific checks. Each fires independently; the operator triages top-to-bottom in the grouped output. Full rule bodies live under `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/<rule-id>.ts` — the per-rule TypeScript file is the source of truth for the exact heuristic + repair-hint text.

| Rule ID | What it checks | Repair hint (summary) |
|---|---|---|
| `scope-discovery-config-missing` | Project references the slug `scope-discovery` in a feature doc but lacks the `.dw-lifecycle/scope-discovery/` config directory. | Run `/dw-lifecycle:install-scope-discovery` in the project root to bootstrap the CONFIG dir. |
| `scope-discovery-schema-stale` | A scope-discovery YAML (`clones.yaml`, `anti-patterns.yaml`, `adopter-manifests.yaml`) is missing `schemaVersion:` or carries an older version than the plugin's `CURRENT_SCHEMA_VERSION`. | Add or bump the `schemaVersion:` field per the schema doc; legacy parses still work but the rule warns until the field is current. |
| `clones-yaml-schema-violation` | `clones.yaml` fails the strict parser (`parseClonesYamlStrict`). | Diff the file against `plugins/dw-lifecycle/src/scope-discovery/schema/clones.yaml.schema.json`; the error message names the failing entry index and field. |
| `anti-patterns-yaml-schema-violation` | `anti-patterns.yaml` fails registry-load validation. | Diff against `plugins/dw-lifecycle/src/scope-discovery/schema/anti-patterns.yaml.schema.json`; the error names the failing entry. |
| `clones-yaml-refactor-incomplete` | A `clones.yaml` entry with `disposition: refactor` is missing or has malformed Step 0a / Step 0b fields (`canonical_side`, `canonical_reason`, `new_shape_summary`, `tests`, `tests_proof`). | Each precondition error becomes its own finding with a per-branch repair hint that names the exact missing artifact. |
| `override-drift` | An operator-curated TypeScript override at `.dw-lifecycle/scope-discovery/<name>.ts` has drifted substantially from the plugin's default at `plugins/dw-lifecycle/src/scope-discovery/<name>.ts` (heuristic: >50 line delta OR exported-symbol surface differs). Advisory severity — overrides are deliberate. | Re-read the plugin default and decide whether to converge. The rule's job is to nudge re-review, not to error. |

When the `.dw-lifecycle/scope-discovery/` directory is absent, these rules are no-ops — they do not warn about their own absence (that would spam every adopter of `dw-lifecycle` who hasn't opted into scope-discovery). The `scope-discovery-config-missing` rule is the one exception: it fires when the project's docs reference scope-discovery (i.e. the project is mid-adoption) but the directory hasn't been created yet.

## Error handling

- **`--fix=<unknown-rule>`.** List available rules and stop.
- **No findings.** Report `no findings` and exit 0.
- **`stale-issue`** depends on `gh` being able to read the repo's GitHub issue state from the current project root.
- **Scope-discovery rules** are read-only in the current cut. `--fix=<scope-discovery-rule>` is not yet wired; the operator runs the named install / uninstall command from the repair hint manually.
