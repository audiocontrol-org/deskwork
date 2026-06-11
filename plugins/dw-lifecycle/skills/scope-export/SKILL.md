---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:scope-export

Emit a previously-produced `scope-manifest.yaml` for a feature to stdout. Companion to `/dw-lifecycle:scope-inventory` — that skill WRITES the manifest, this one READS it for downstream consumers (skill prose, CI pipelines, operator scripts) that don't want to know the on-disk path. Default emits the YAML file verbatim (preserves comments and ordering); `--json` re-emits the parsed manifest as JSON.

## Steps

1. Identify how to address the manifest: either by feature slug (the default `docs/1.0/001-IN-PROGRESS/<slug>/scope-manifest.yaml` is computed for you), or by explicit `--manifest <path>` override.
2. Shell out to the helper:

```
dw-lifecycle scope-export [--slug <slug>] [--manifest <path>] [--json] [--quiet]
```

The helper:
   - Resolves the manifest path from `--slug` (default location matches scope-inventory's default output) or honors the explicit `--manifest` override.
   - Default mode reads the file and writes it to stdout verbatim — comments, ordering, whitespace preserved.
   - `--json` parses the YAML and re-emits via `JSON.stringify`.
   - Writes a single-line status to stderr naming which path was resolved (suppressed by `--quiet`).

3. Report: the manifest path resolved, the output mode (YAML vs JSON), and how many bytes were emitted.

## Flags

| Flag | Meaning |
|---|---|
| `--slug <slug>` | Resolve the default manifest path from the slug. Required unless `--manifest` is set explicitly. |
| `--manifest <path>` | Override the manifest path explicitly. When set, `--slug` is no longer required. |
| `--json` | Emit parsed JSON instead of raw YAML. Useful when piping into `jq` or a tool that expects structured input. |
| `--quiet` | Suppress the informational stderr status line. |

## Error handling

- **Manifest missing.** Helper exits 2 with the resolved path in the error message. Run `/dw-lifecycle:scope-inventory <slug>` first so the manifest exists.
- **Malformed YAML under `--json`.** Helper exits 2 and reports the parser's column/line. Default raw-YAML mode tolerates anything readable; `--json` requires a parseable document.
- **Neither `--slug` nor `--manifest` provided.** Helper exits 2 with a usage hint.

## When to use

Use scope-export when another tool needs the manifest's contents — e.g. a CI step that asserts the manifest is present and valid, a script that re-pivots the manifest into a different schema, or a downstream skill that reads `regime_holdouts:` for follow-up triage. For day-to-day "what surfaces does this feature touch?" reading, open the YAML file directly; scope-export earns its keep when the consumer is non-human.
