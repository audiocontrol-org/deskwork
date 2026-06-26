---
id: TASK-283
title: >-
  AUDIT-20260619-22 — `shownFlags` regex is vacuously safe today but silently
  fails if the help table adopts a short-flag column style without a comma
  separator
status: Done
assignee: []
created_date: '2026-06-19 01:35'
updated_date: '2026-06-26 04:09'
labels:
  - 'type:migrated-finding'
  - 'feature:027-roadmap-edge-mutation-and-cluster'
  - 'finding:AUDIT-20260619-22'
dependencies: []
references:
  - 'audit:027-roadmap-edge-mutation-and-cluster:AUDIT-20260619-22'
priority: medium
ordinal: 283000
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: H5 help/parser-adapter test-hardening (commit 83ead572)
<!-- SECTION:NOTES:END -->
