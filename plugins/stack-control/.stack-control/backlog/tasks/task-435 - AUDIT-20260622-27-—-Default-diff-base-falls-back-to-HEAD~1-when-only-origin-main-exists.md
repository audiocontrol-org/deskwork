---
id: TASK-435
title: >-
  AUDIT-20260622-27 — Default diff base falls back to HEAD~1 when only
  origin/main exists
status: Done
assignee: []
created_date: '2026-06-22 13:59'
updated_date: '2026-06-23 06:09'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-27
ordinal: 435000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/govern/payload-diff-scope.ts:146-174: the diff-base resolver falls back to HEAD~1 when origin/main is the only ref, which can scope the wrong range. From 030 round-3 govern (codex).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: verified in formally-installed release v0.53.2 (PR #497); fix present in installed cache + clean boot
<!-- SECTION:NOTES:END -->
