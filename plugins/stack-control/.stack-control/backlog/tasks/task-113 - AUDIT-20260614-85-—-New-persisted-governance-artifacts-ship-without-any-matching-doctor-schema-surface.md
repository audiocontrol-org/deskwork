---
id: TASK-113
title: >-
  AUDIT-20260614-85 — New persisted governance artifacts ship without any
  matching doctor/schema surface
status: To Do
assignee: []
created_date: '2026-06-14 18:32'
labels:
  - 'type:migrated-finding'
  - 'feature:audit-protocol-friction-burndown'
  - 'finding:AUDIT-20260614-85'
dependencies: []
references:
  - 'audit:audit-protocol-friction-burndown:AUDIT-20260614-85'
priority: medium
ordinal: 113000
---



## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-scoped 2026-06-22: phase-checkpoints artifact cited in original finding was deleted by 030 US2 (moot). Surviving gap: fleet-knowledge.yaml ships with only light setup verification (verify.ts:44) and no full schema/doctor rule — same surviving gap as TASK-77. Confirm whether this is a dup of TASK-77; if so, close as dup. Otherwise scope to fleet-knowledge.yaml doctor rule + schema validation only.
<!-- SECTION:DESCRIPTION:END -->
