---
id: TASK-389
title: >-
  tsc --noEmit fails on src/release/portable.ts (Property source/path does not
  exist on type object, ~lines 100/107) on a clean tree — typecheck gate not
  green; pre-existing, unrelated to 029
status: Done
assignee: []
created_date: '2026-06-21 01:28'
updated_date: '2026-06-25 19:47'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 389000
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed on feature/stack-control-hygiene (commit 37b0b615): isRecord guard narrows Codex marketplace source; tsc --noEmit green, release-portability.test.ts passing.
<!-- SECTION:NOTES:END -->
