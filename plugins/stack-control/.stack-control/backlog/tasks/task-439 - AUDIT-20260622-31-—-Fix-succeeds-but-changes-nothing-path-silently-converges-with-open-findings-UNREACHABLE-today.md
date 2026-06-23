---
id: TASK-439
title: >-
  AUDIT-20260622-31 — Fix-succeeds-but-changes-nothing path silently converges
  with open findings (UNREACHABLE today)
status: Done
assignee: []
created_date: '2026-06-22 13:59'
updated_date: '2026-06-23 06:09'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-31
ordinal: 439000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/govern/end-govern-pipeline.ts:190-200: when applyFixes returns success with changedFiles:[], nextAuditIds is empty, openFindings set to [] and the run converges with unfixed findings marked closed-in-loop. UNREACHABLE today (applyFixes deferred, TASK-424) but unguarded. Distinguish no-op fix from genuine no-resurface; consider fix-failure-surfaced. From 030 round-3 govern (claude).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: verified in formally-installed release v0.53.2 (PR #497); fix present in installed cache + clean boot
<!-- SECTION:NOTES:END -->
