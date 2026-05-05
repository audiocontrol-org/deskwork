---
name: doctor
description: "Audit binding metadata across calendar/journal/docs/issues; opt-in --fix"
---

# /dw-lifecycle:doctor

Read-only audit (default) or opt-in repair (`--fix=<rule>`) of binding metadata.

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

2. Display findings grouped by severity (error / warning).
3. For `--fix=<rule>`, prompt operator before each repair (unless `--yes`).

## Error handling

- **`--fix=<unknown-rule>`.** List available rules and stop.
- **No findings.** Report `no findings` and exit 0.

`stale-issue` depends on `gh` being able to read the repo's GitHub issue state from the current project root.
