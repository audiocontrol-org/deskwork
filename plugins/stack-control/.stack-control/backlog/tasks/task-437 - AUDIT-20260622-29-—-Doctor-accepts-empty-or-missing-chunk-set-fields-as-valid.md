---
id: TASK-437
title: AUDIT-20260622-29 — Doctor accepts empty or missing chunk-set fields as valid
status: Done
assignee: []
created_date: '2026-06-22 13:59'
updated_date: '2026-06-23 06:09'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-29
ordinal: 437000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/scope-discovery/doctor-rules/chunked-govern-artifacts.ts:65-70: the doctor rule accepts empty/missing chunk-set fields as valid, so a malformed convergence artifact passes doctor. From 030 round-3 govern (codex).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: verified in formally-installed release v0.53.2 (PR #497); fix present in installed cache + clean boot
<!-- SECTION:NOTES:END -->
