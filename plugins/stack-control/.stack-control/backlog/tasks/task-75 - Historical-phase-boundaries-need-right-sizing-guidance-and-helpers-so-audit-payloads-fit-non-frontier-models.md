---
id: TASK-75
title: >-
  Historical phase boundaries need right-sizing guidance and helpers so audit
  payloads fit non-frontier models
status: To Do
assignee: []
created_date: '2026-06-14 02:14'
updated_date: '2026-06-14 02:14'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Historical per-phase backfill currently requires manual decomposition when original phases are too large for practical barrage runs. Stack-control should surface rendered prompt size, approximate token count, scoped file contributors, and warning thresholds before execution, and should provide first-class guidance or helpers for splitting a historical phase into smaller bounded audit units while preserving provenance and audit continuity. The target outcome is payloads that are small enough for non-frontier models to participate reliably.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/021-audit-protocol-friction-burndown
<!-- SECTION:NOTES:END -->
