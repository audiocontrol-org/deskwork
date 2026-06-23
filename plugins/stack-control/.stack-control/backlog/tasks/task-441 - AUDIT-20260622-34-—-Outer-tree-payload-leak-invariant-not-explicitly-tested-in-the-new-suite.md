---
id: TASK-441
title: >-
  AUDIT-20260622-34 — Outer-tree payload leak invariant not explicitly tested in
  the new suite
status: Done
assignee: []
created_date: '2026-06-22 13:59'
updated_date: '2026-06-23 06:09'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-34
ordinal: 441000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/__tests__/govern-installation-anchor.test.ts (deleted) guarded the outer-tree payload-leak invariant; the replacement payload-diff-scope suite does not re-pin it. Add a replacement test. Relates to -14/-15/TASK-428/429. From 030 round-3 govern (claude).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: verified in formally-installed release v0.53.2 (PR #497); fix present in installed cache + clean boot
<!-- SECTION:NOTES:END -->
