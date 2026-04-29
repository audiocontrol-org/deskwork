---
name: dw-lifecycle:doctor
description: "Audit binding metadata across calendar/journal/docs/issues; opt-in --fix"
user_invocable: true
---

# /dw-lifecycle:doctor

Read-only audit (default) or opt-in repair (`--fix=<rule>`) of binding metadata.

## Steps

1. Shell out to the helper:

```
dw-lifecycle doctor [--fix=<rule>] [--yes]
```

The helper runs all rules:
- `missing-config` — no `.dw-lifecycle/config.json`
- `peer-plugins` — `superpowers` (required) or `feature-dev` (recommended) missing
- `version-shape-drift` — `docs/<v>/<status>/<slug>/` directories present for versions not in `config.docs.knownVersions`
- `orphan-feature-doc` — directory in `inProgress` with no matching workplan
- `stale-issue` — GitHub issue closed but feature still in `inProgress`
- `journal-feature-mismatch` — journal entry references a slug with no doc directory

2. Display findings grouped by severity (error / warning).
3. For `--fix=<rule>`, prompt operator before each repair (unless `--yes`).

## Error handling

- **`--fix=<unknown-rule>`.** List available rules and stop.
- **No findings.** Report `no findings` and exit 0.
