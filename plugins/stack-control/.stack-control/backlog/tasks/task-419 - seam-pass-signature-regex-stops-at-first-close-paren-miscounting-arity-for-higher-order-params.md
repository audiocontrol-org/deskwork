---
id: TASK-419
title: >-
  seam-pass signature regex stops at first close-paren, miscounting arity for
  higher-order params
status: To Do
assignee: []
created_date: '2026-06-22 00:06'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - dogfood-030-2026-06-21-seam-arity
ordinal: 419000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
030 dogfood (chunk run 232806229Z): the seam-pass function-signature regex stops at the first ) so a parameter that is itself a function type (with its own parens) miscounts arity, weakening the interface-break detection.
<!-- SECTION:DESCRIPTION:END -->
