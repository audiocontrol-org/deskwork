---
id: TASK-408
title: >-
  030 analyze C1 (HIGH): single-file-over-envelope unmodeled — threatens SC-001
  never-FATAL
status: To Do
assignee: []
created_date: '2026-06-21 17:57'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - specs/030-chunked-end-govern/spec.md
ordinal: 408000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
spec.md:166 edge case promises a single changed file whose own diff exceeds the envelope is hunk-level sub-split and never FATALs, but no FR/entity/task backs it. FR-006 only sub-splits a CLUSTER (group of files) into sub-files; a single oversized file cannot be split that way. data-model Chunk invariant renderedBytes <= envelope (data-model.md:34,36) is then unsatisfiable -> FATAL or silent envelope overrun, breaking SC-001 (MVP). Fix: add an FR for hunk-level intra-file sub-split + a split-file representation + a RED task under US1. Operator chose 2026-06-21 to proceed-as-is and capture.
<!-- SECTION:DESCRIPTION:END -->
