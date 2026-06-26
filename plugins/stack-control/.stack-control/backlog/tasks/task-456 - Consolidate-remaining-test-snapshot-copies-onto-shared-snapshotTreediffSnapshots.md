---
id: TASK-456
title: >-
  Consolidate remaining test snapshot copies onto shared
  snapshotTree+diffSnapshots
status: To Do
assignee: []
created_date: '2026-06-26 05:20'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 455000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
compass-cli.test.ts:24 and query-verbs.test.ts:23 still key files by size:mtime (carry the AUDIT-149/153 same-size in-place-edit blind spot H9 removed from the isolation harness); cross-installation-isolation.test.ts:31 keeps a raw-content copy with no dir entries. Surfaced by H9 code-review. Route all through _isolation-harness snapshotTree+diffSnapshots.
<!-- SECTION:DESCRIPTION:END -->
