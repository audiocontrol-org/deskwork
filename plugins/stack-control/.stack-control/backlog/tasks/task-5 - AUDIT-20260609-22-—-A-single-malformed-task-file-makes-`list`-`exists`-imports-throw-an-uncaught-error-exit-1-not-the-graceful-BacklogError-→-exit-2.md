---
id: TASK-5
title: >-
  AUDIT-20260609-22 — A single malformed task file makes `list`/`exists`/imports
  throw an uncaught error (exit 1, not the graceful BacklogError → exit 2)
status: Done
assignee: []
created_date: '2026-06-09 19:37'
updated_date: '2026-06-21 06:45'
labels:
  - 'type:migrated-finding'
  - 'feature:pluggable-lifecycle-providers'
  - 'finding:AUDIT-20260609-22'
  - promoted
dependencies: []
references:
  - 'audit:pluggable-lifecycle-providers:AUDIT-20260609-22'
priority: low
ordinal: 5000
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/014-audit-protocol-reliability

specs/014 US8 implemented: per-file parse guard in the backlog backend — list warns + skips (exit 0), exists/import idempotency throw BacklogError naming the file (exit 2, zero duplicates). Commits 125b7c9c/e0af5d44 (RED/fix).
<!-- SECTION:NOTES:END -->
