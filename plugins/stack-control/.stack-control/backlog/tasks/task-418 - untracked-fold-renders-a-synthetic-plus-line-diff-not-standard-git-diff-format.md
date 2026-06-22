---
id: TASK-418
title: >-
  untracked-fold renders a synthetic plus-line diff, not standard git diff
  format
status: To Do
assignee: []
created_date: '2026-06-22 00:06'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - dogfood-030-2026-06-21-untracked-format
ordinal: 418000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
030 dogfood (chunk run 232806229Z): payload-diff-scope.ts renders untracked files as content.split.map(+line) rather than a real 'git diff --no-index' add-diff; the non-standard format can confuse the audit lane and diverges from the render arm's untracked handling.
<!-- SECTION:DESCRIPTION:END -->
