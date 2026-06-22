---
id: TASK-421
title: >-
  gate dampener counts N chunks as N runs (per-chunk runProtocol writes N lift
  sections)
status: To Do
assignee: []
created_date: '2026-06-22 00:17'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - dogfood-030-2026-06-21-dampener-chunks
ordinal: 421000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
030 dogfood: a chunked govern invocation writes one audit-log lift section per chunk (the CLI loops runProtocol per chunk), so the dampener N-quiet / last-2-runs streak counts chunks, not govern invocations (observed: chunk3 eval read chunks 2+3). Root cause = TASK-413: wire end-govern-pipeline (reconcile-once → one record → one lift) so one invocation is one run. Symptom of the reuse seam, not a standalone patch.
<!-- SECTION:DESCRIPTION:END -->
