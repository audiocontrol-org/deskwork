---
id: TASK-15
title: >-
  AUDIT-20260610-08: over-rejection of label-for + input (structure-and-flow
  form controls)
status: Done
assignee: []
created_date: '2026-06-10 18:55'
updated_date: '2026-06-10 20:40'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/001-design-control/audit-log.md AUDIT-20260610-08 (gpt-5-05
  - MED false-positive; feeds the positive-corpus task)
ordinal: 15000
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed d3137b5d via AUDIT-20260610-24 (fourth surfacing promoted it): form/input/label-for allowlisted, input type enumerated. audit-log AUDIT-08 -> fixed-d3137b5d.
<!-- SECTION:NOTES:END -->
