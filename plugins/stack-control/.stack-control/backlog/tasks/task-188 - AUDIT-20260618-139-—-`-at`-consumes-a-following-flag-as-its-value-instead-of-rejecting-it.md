---
id: TASK-188
title: >-
  AUDIT-20260618-139 — `--at` consumes a following flag as its value instead of
  rejecting it
status: Done
assignee: []
created_date: '2026-06-18 05:39'
updated_date: '2026-06-25 20:13'
labels:
  - 'type:migrated-finding'
  - 'feature:026-capability-interface-mediation'
  - 'finding:AUDIT-20260618-139'
dependencies: []
references:
  - 'audit:026-capability-interface-mediation:AUDIT-20260618-139'
priority: low
ordinal: 188000
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed on feature/stack-control-hygiene (commit pending-hash): reconcileVerb --at now rejects a following flag (startsWith('--')) instead of swallowing it into a false all-clean. RED-first capability-reconcile.test.ts; tsc green.
<!-- SECTION:NOTES:END -->
