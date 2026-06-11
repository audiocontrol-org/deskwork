---
id: TASK-43
title: >-
  dw-lifecycle install: no override flags; statusDirs schema is hardcoded to
  three states
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-211
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`dw-lifecycle install` provides only a `--dry-run` flag. The helper probes the host project, decides every config field, and writes `.dw-lifecycle/config.json` with no way to override individual values from the CLI. When the probe's defaults don't match the host project's actual conventions, the only recourse is to edit the JSON file by hand after install.

Additionally, `statusDirs` is a fixed three-key schema (`inProgress`, `waiting`, `complete`) that can't represent richer pipelines.

## Reproduction

Host repo's actual convention (visible from `ls docs/1.0/`):

```
000-PENDING/
0000-INBOUND/
001-IN-PROGRESS/
002-BLOCKED/
003-COMPLETE/
004-ARCHIVE/
```

Helper's dry-run output for the same repo:

```json
"statusDirs": {
  "inProgress": "001-IN-PROGRESS",
  "waiting": "002-WAITING",
  "complete": "003-COMPLETE"
}
```

The helper correctly probed `001-IN-PROGRESS` and `003-COMPLETE` from the filesystem but defaulted `waiting` to `"002-WAITING"`, missing the actual `002-BLOCKED` directory. There is no `pending`, `inbound`, or `archive` field at all — those states have no representation in the schema.

`dw-lifecycle install --help`:

```
Usage: dw-lifecycle install <project-root> [--dry-run]
Probes the host project and writes .dw-lifecycle/config.json.
```

No way to override any field.

## Workaround used

```
dw-lifecycle install .
# manually edit .dw-lifecycle/config.json to set statusDirs.waiting = "002-BLOCKED"
```

## Suggested fixes

1. **Probe more aggressively.** Map any `00N-<NAME>` directory by name pattern, not just the three hardcoded slots. If `002-BLOCKED` exists alongside `001-IN-PROGRESS` and `003-COMPLETE`, infer that "blocked" is this repo's `waiting`-equivalent and set `statusDirs.waiting = "002-BLOCKED"`.
2. **Add CLI overrides** for the most-tweaked fields:
   - `--status-in-progress=<name>`
   - `--status-waiting=<name>`
   - `--status-complete=<name>`
   - `--default-target-version=<v>`
   - `--known-version=<v>` (repeatable)
3. **Accept a config-overlay JSON.** `--config-overlay <path>` reads a JSON object that's deep-merged onto the probed defaults before write. Solves the override problem generically without growing the flag surface.
4. **Extend the `statusDirs` schema** to be a free-form `{label: directory}` map plus a small enum of "transition role" tags (`enters`, `working`, `terminal`, etc.). Lets host projects represent PENDING / INBOUND / ARCHIVE without forking the helper.

## Environment

- dw-lifecycle 0.15.0
- Host project: monorepo using a six-state docs pipeline
<!-- SECTION:DESCRIPTION:END -->
