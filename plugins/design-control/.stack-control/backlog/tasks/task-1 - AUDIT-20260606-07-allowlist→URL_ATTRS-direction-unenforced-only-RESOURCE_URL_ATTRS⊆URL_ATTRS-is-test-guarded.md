---
id: TASK-1
title: >-
  AUDIT-20260606-07: allowlist→URL_ATTRS direction unenforced (only
  RESOURCE_URL_ATTRS⊆URL_ATTRS is test-guarded)
status: Done
assignee: []
created_date: '2026-06-10 17:47'
updated_date: '2026-06-10 18:38'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed in 74b824cc (with TASK-7): URL_ATTRS derived from kind-tagged allowlist entries; behavioral test loops every url-kind pair through the lint. audit-log AUDIT-20260606-07 flipped to fixed-74b824cc.
<!-- SECTION:NOTES:END -->
