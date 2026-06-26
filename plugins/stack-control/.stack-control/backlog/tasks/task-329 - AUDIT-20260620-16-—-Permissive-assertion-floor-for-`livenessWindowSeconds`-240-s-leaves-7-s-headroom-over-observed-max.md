---
id: TASK-329
title: >-
  AUDIT-20260620-16 — Permissive assertion floor for `livenessWindowSeconds`
  (240 s) leaves 7 s headroom over observed max
status: Done
assignee: []
created_date: '2026-06-20 07:46'
updated_date: '2026-06-26 02:13'
labels:
  - 'type:migrated-finding'
  - 'feature:029-govern-operability'
  - 'finding:AUDIT-20260620-16'
dependencies: []
references:
  - 'audit:029-govern-operability:AUDIT-20260620-16'
priority: low
ordinal: 329000
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed in 9303221b (H2 payload-scaled liveness window + reliability test hardening)
<!-- SECTION:NOTES:END -->
