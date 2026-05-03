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

2. Display findings grouped by severity (error / warning).
3. For `--fix=<rule>`, prompt operator before each repair (unless `--yes`).

## Error handling

- **`--fix=<unknown-rule>`.** List available rules and stop.
- **No findings.** Report `no findings` and exit 0.

## Scope note

Additional doctor rules described in the feature PRD remain backlog until the helper implements them. This skill should not imply those checks already ship.
