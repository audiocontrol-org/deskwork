---
id: TASK-2
title: >-
  AUDIT-20260609-19 — `slush-findings` rewire derives the dry-run count and the
  applied migration from two independent walks — a keying divergence silently
  drops findings and leaves them `open`
status: To Do
assignee: []
created_date: '2026-06-09 19:37'
updated_date: '2026-06-11 02:29'
labels:
  - 'type:migrated-finding'
  - 'feature:pluggable-lifecycle-providers'
  - 'finding:AUDIT-20260609-19'
  - promoted
dependencies: []
references:
  - 'audit:pluggable-lifecycle-providers:AUDIT-20260609-19'
priority: medium
ordinal: 2000
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/014-audit-protocol-reliability

specs/014 US4 implemented: slush apply consumes the dampener flips (with located status lines) directly; findFindingsByStatus left the apply path; unlocatable flip fails loud (exit 1). Commits 72fcce80/a1f53321 (RED/fix).
<!-- SECTION:NOTES:END -->
