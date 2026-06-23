---
id: TASK-436
title: AUDIT-20260622-28 — Untracked fold lost the binary and byte-budget safeguards
status: Done
assignee: []
created_date: '2026-06-22 13:59'
updated_date: '2026-06-23 06:09'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-28
ordinal: 436000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/govern/payload-diff-scope.ts:210-213: the untracked-file fold no longer guards against binary files / a byte budget, so a large or binary untracked file can bloat the payload. From 030 round-3 govern (codex).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: verified in formally-installed release v0.53.2 (PR #497); fix present in installed cache + clean boot
<!-- SECTION:NOTES:END -->
