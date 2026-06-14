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
Historical per-phase backfill currently requires manual decomposition when original phases are too large for practical barrage runs. Stack-control should surface rendered prompt size, approximate token count, scoped file contributors, and warning thresholds before execution, and should provide first-class guidance or helpers for splitting a historical phase into smaller bounded audit units while preserving provenance and audit continuity.

This has at least two distinct boundary-sizing edges:

1. **Prospective boundary sizing before execution.** Before implementation or backfill starts, stack-control should help define likely audit units that are small enough to be governable. This is necessarily a guess based on task shape, declared file scope, prior feature patterns, and configured fleet capabilities.
2. **Actual boundary sizing after implementation.** Once the prospective boundary has been implemented, stack-control should measure the real rendered audit payload and decide whether that unit still fits within the capabilities of the configured auditor lanes. If not, it should warn, refuse, or help split/refine the audit unit rather than silently shipping an oversized barrage prompt.

The target outcome is audit units that are small enough for non-frontier models to participate reliably, with both a planning-time estimate and a post-implementation reality check.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/021-audit-protocol-friction-burndown
<!-- SECTION:NOTES:END -->
