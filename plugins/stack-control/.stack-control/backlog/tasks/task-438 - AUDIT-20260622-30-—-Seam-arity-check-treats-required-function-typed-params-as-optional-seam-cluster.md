---
id: TASK-438
title: >-
  AUDIT-20260622-30 — Seam arity check treats required function-typed params as
  optional (seam cluster)
status: To Do
assignee: []
created_date: '2026-06-22 13:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-30
ordinal: 438000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/govern/seam-pass.ts:105-110: required function-typed params are treated as optional in the arity check. Joins the seam-pass cluster TASK-426/427/431 (-07/-08/-19). From 030 round-3 govern (codex).
<!-- SECTION:DESCRIPTION:END -->
