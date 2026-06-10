---
id: TASK-1
title: >-
  AUDIT-20260606-07: allowlist→URL_ATTRS direction unenforced (only
  RESOURCE_URL_ATTRS⊆URL_ATTRS is test-guarded)
status: To Do
assignee: []
created_date: '2026-06-10 17:47'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - >-
    specs/001-design-control/audit-log.md AUDIT-20260606-07; enhancement half
    filed as #428
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Slushed 2026-06-06 (low). The value-shape gate fires on URL_ATTRS.has(attr) after allowlist membership, so an allowlisted URL attr missing from URL_ATTRS leaves values unscanned; no test enforces that direction.
<!-- SECTION:DESCRIPTION:END -->
