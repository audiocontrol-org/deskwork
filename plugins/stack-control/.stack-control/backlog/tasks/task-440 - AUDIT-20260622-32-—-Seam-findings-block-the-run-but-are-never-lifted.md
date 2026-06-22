---
id: TASK-440
title: AUDIT-20260622-32 — Seam findings block the run but are never lifted
status: To Do
assignee: []
created_date: '2026-06-22 13:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-32
ordinal: 440000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/govern/end-govern-pipeline.ts:193-217 + govern-arms.ts:312-345: seam-pass findings drive override-eligible but are not included in the lift section, so the operator cannot see what blocked. Lift seam findings alongside chunk findings. From 030 round-3 govern (codex).
<!-- SECTION:DESCRIPTION:END -->
