---
id: TASK-429
title: >-
  AUDIT-20260622-15 — Rename-aware committed diff coverage was deleted and not
  replaced
status: Done
assignee: []
created_date: '2026-06-22 09:03'
updated_date: '2026-06-23 06:09'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-15
ordinal: 429000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deleted src/__tests__/govern/govern-rename-scope.test.ts guarded: a pure tree move must emit as a rename independent of diff.renames config. No replacement. A moved large file with rename detection off -> doubled body -> oversized chunks. Fix: replacement test exercising scopeCommittedDiff on git mv with diff.renames=false. From 030 whole-feature govern (codex).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: verified in formally-installed release v0.53.2 (PR #497); fix present in installed cache + clean boot
<!-- SECTION:NOTES:END -->
