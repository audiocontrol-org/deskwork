---
id: TASK-240
title: >-
  AUDIT-20260618-159 — Front-door anchoring test bypasses the front-door command
  surface
status: Done
assignee: []
created_date: '2026-06-18 06:14'
updated_date: '2026-06-26 05:36'
labels:
  - 'type:migrated-finding'
  - 'feature:026-capability-interface-mediation'
  - 'finding:AUDIT-20260618-159'
dependencies: []
references:
  - 'audit:026-capability-interface-mediation:AUDIT-20260618-159'
priority: medium
ordinal: 240000
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: H10: rewired to drive the REAL CLI verbs (front-door/mediate-check/intercept) through installation fixtures via runCli instead of pure cores/low-level writers — refuse-unmarked/permit-marked + inside-vs-outside contrasts make each assertion load-bearing
<!-- SECTION:NOTES:END -->
