---
id: TASK-2
title: >-
  AUDIT-20260606-21: normalizeSriToken base64-case-preservation only
  incidentally tested
status: To Do
assignee: []
created_date: '2026-06-10 17:47'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - specs/001-design-control/audit-log.md AUDIT-20260606-21
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Slushed 2026-06-06 (low). No test plants a case-mangled SRI payload and asserts stylesheet-sri-mismatch; the uppercase-prefix test guards the lowercase-everything regression only via the fixture digest's incidental mixed case.
<!-- SECTION:DESCRIPTION:END -->
