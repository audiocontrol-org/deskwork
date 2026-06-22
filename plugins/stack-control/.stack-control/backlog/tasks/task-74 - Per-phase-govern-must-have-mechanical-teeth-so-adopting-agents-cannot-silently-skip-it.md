---
id: TASK-74
title: >-
  Per-phase govern must have mechanical teeth so adopting agents cannot silently
  skip it
status: Done
assignee: []
created_date: '2026-06-14 02:14'
updated_date: '2026-06-22 17:33'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The per-phase audit requirement should be mechanically enforced, not just documented. If a feature/spec declares per-phase governance, the govern path, execution path, and any adoption/backfill workflow should refuse or block when the required per-phase audit artifacts, scoping metadata, or checkpoint records are absent. The operator should not have to manually notice that an agent skipped per-phase governance; the protocol should make skipping structurally impossible or loudly refused.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/021-audit-protocol-friction-burndown
<!-- SECTION:NOTES:END -->
