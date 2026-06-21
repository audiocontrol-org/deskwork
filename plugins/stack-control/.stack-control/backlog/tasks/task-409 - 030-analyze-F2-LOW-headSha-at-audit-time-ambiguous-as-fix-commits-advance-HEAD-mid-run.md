---
id: TASK-409
title: >-
  030 analyze F2 (LOW): headSha at-audit-time ambiguous as fix commits advance
  HEAD mid-run
status: To Do
assignee: []
created_date: '2026-06-21 17:57'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - specs/030-chunked-end-govern/data-model.md
ordinal: 409000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
data-model.md:119 headSha is HEAD at audit time, but FR-009 autonomous apply+commit advances HEAD mid-run. Ambiguous whether headSha is run-start HEAD (chunk membership frozen, content refreshed — what TouchedSet implies) or post-fix HEAD. FR-004 determinism is phrased for re-runs, not within-run rounds. Fix: state chunk membership is frozen at run-start governedSha..HEAD; re-audit refreshes touched-chunk content only.
<!-- SECTION:DESCRIPTION:END -->
