---
id: TASK-428
title: >-
  AUDIT-20260622-14 — Other-feature scaffolds no longer excluded from implement
  payload (exclusion narrowed to audit-log.md only)
status: Done
assignee: []
created_date: '2026-06-22 09:03'
updated_date: '2026-06-23 06:09'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-14
ordinal: 428000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/govern/payload-diff-scope.ts:68-72: resolveImplementExclusion excludes only the per-other-root audit-log.md, NOT the whole root. Deleted self-reference test required whole other-feature-root exclusion (e.g. specs/002-unrelated/scaffold.md). Unrelated parked scaffolds can now enter the chunked payload -> false-finding generator. DESIGN QUESTION: whole-root exclusion vs audit-log-only? From 030 whole-feature govern (codex). NEEDS OPERATOR DESIGN CALL.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: verified in formally-installed release v0.53.2 (PR #497); fix present in installed cache + clean boot
<!-- SECTION:NOTES:END -->
