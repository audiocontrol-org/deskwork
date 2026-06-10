---
id: TASK-2
title: >-
  AUDIT-20260606-21: normalizeSriToken base64-case-preservation only
  incidentally tested
status: Done
assignee: []
created_date: '2026-06-10 17:47'
updated_date: '2026-06-10 18:38'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed in ec6308cb: direct case-mangled-payload rejection test with in-test vacuity guard; mutation-verified (case-insensitive-compare mutation caught by exactly this test). audit-log AUDIT-20260606-21 flipped to fixed-ec6308cb.
<!-- SECTION:NOTES:END -->
