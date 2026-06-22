---
id: TASK-414
title: end-govern reconcile drops findings from chunks not re-audited in the loop
status: To Do
assignee: []
created_date: '2026-06-22 00:06'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - dogfood-030-2026-06-21-reconcile-drop
ordinal: 414000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
030 dogfood (chunk run 232806229Z): close-in-loop reconciliation only reconciles re-audited chunks; findings from chunks skipped in a later round are dropped from the composed result. Coverage hole in the convergence loop.
<!-- SECTION:DESCRIPTION:END -->
