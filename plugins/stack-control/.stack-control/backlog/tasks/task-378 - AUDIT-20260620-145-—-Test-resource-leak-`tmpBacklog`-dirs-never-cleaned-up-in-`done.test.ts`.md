---
id: TASK-378
title: >-
  AUDIT-20260620-145 — Test resource leak: `tmpBacklog()` dirs never cleaned up
  in `done.test.ts`
status: Done
assignee: []
created_date: '2026-06-20 19:07'
updated_date: '2026-06-22 21:07'
labels:
  - 'type:migrated-finding'
  - 'feature:029-govern-operability'
  - 'finding:AUDIT-20260620-145'
dependencies: []
references:
  - 'audit:029-govern-operability:AUDIT-20260620-145'
priority: low
ordinal: 378000
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed 2026-06-22 (commit eda7e09f): tests/backlog/done.test.ts now removes its tmpBacklog dirs in afterEach.
<!-- SECTION:NOTES:END -->
