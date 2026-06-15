---
id: TASK-58
title: >-
  stackctl govern: untracked files folded into the audited diff render with
  absolute a/Users/... paths
status: To Do
assignee: []
created_date: '2026-06-12 06:26'
updated_date: '2026-06-14 01:54'
labels:
  - 'type:imported-issue'
  - promoted
dependencies: []
references:
  - gh-458
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What

`stackctl govern` folds untracked working-tree files into the audited diff payload, but renders them with **absolute paths** posing as repo-relative ones:

```
diff --git a/Users/orion/work/deskwork-work/design-control/plugins/...
```

Observed in run `20260611T062812148Z-design-control-after_clarify` (design-control nested installation): the untracked sibling run-dir `20260611T062218157Z` was folded into the payload with `a/Users/orion/...` prefixes.

## Why it matters

- Any consumer that applies or path-keys on the emitted diff would create a literal `Users/` tree at the repo root.
- Cross-model auditors fed this payload are misled into believing such a tree was committed — one barrage lane explicitly reported being misled until a live `ls` disproved it (lifted as AUDIT-20260611-08 in the design-control feature audit-log).

## Repro

1. In a stack-control installation, leave any file untracked under the installation root.
2. Run `stackctl govern --mode implement`.
3. Inspect the run-dir `PROMPT.md`: the untracked file appears as `diff --git a/<absolute path>`.

## Suggested fix

Render untracked files with correct repo-relative prefixes (or exclude untracked files from the fold entirely — see the companion issue about audit-runs self-inclusion).

Provenance: design-control feature audit-log AUDIT-20260611-08, run-dir `plugins/design-control/.stack-control/audit-runs/20260611T062812148Z-design-control-after_clarify`.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/021-audit-protocol-friction-burndown
<!-- SECTION:NOTES:END -->
