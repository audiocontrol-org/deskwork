---
id: TASK-10
title: >-
  AUDIT-20260610-03: transitive font resources not identity-pinned (CSS bytes
  only)
status: Done
assignee: []
created_date: '2026-06-10 18:55'
updated_date: '2026-06-10 19:16'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - specs/001-design-control/audit-log.md AUDIT-20260610-03 (gpt-5-01
  - HIGH)
ordinal: 10000
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed f9abab31: pin.expectedFonts from shipped kit; font-hash-mismatch on present-but-different. audit-log AUDIT-20260610-03 -> fixed-f9abab31.
<!-- SECTION:NOTES:END -->
