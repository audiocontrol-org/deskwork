---
id: TASK-431
title: >-
  AUDIT-20260622-19 — Seam pass declares changed-required-shape but never
  implements it (interface/type required-shape changes suppressed)
status: To Do
assignee: []
created_date: '2026-06-22 11:07'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-19
ordinal: 431000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/govern/seam-pass.ts:113-131,187-197: the SeamFinding schema (chunk-artifacts.ts:77-83) includes changed-required-shape, but the impl only parses exported function arity/names and emits removed-export/changed-arity. export interface/type required-field changes parse as null -> treated compatible -> suppressed. A cross-chunk required-field addition can converge. Joins the seam-pass cluster TASK-426/427. From 030 round-2 govern (codex).
<!-- SECTION:DESCRIPTION:END -->
