---
id: TASK-408
title: >-
  030 analyze C1 (HIGH): single-file-over-envelope unmodeled — threatens SC-001
  never-FATAL
status: Done
assignee: []
created_date: '2026-06-21 17:57'
updated_date: '2026-06-22 17:24'
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

RESOLVED (operator decision 2026-06-21): WONTFIX the hunk-level split — there should NEVER be a single file exceeding the envelope. A code file that large is a priori broken (violates the 300-500-line cap, Constitution VI); a non-code file that large is not useful in the stack-control audit context. The correct behavior is FAIL LOUD on a single-file-over-envelope (a real defect to surface), which is distinct from the never-FATAL feature-size guarantee. No hunk-split, no split-file concept. spec.md:166 + research.md R2 corrected; envelope-binpack (T019) fails loud on the degenerate case. Awaiting operator close (no sanctioned backlog-close verb — TASK-297).
<!-- SECTION:DESCRIPTION:END -->
