---
id: TASK-411
title: >-
  030 analyze F1 (MEDIUM): split-file vs split-cluster terminology — entity
  model has only SplitClusterMarker
status: To Do
assignee: []
created_date: '2026-06-21 17:57'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - 'specs/030-chunked-end-govern/spec.md:166-219'
ordinal: 411000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
spec.md:166 and 171 name a split-file marker but Key Entities (spec.md:219), data-model (SplitClusterMarker only), every FR and every task define only SplitClusterMarker. The split-file concept has no model/code referent. Paired with C1 (TASK-408): either model split-file as a real entity or remove the wording and state how single-oversized-file is represented.
<!-- SECTION:DESCRIPTION:END -->
