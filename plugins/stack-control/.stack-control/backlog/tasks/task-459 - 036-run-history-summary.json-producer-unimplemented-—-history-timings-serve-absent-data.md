---
id: TASK-459
title: >-
  036 run-history summary.json producer unimplemented — history/timings serve
  absent data
status: To Do
assignee: []
created_date: '2026-07-17 20:34'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 458000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
T101 runHistory/runTimings read the finalized per-run summary.json (runs/{installationId}/{runId}/summary.json, 'finalized once at run end' per data-model § Storage layout) via the CDN reader, and honestly represent all four FR-085 phase durations (design/spec/execution/governance) as ABSENT because no write path produces that object yet. The archive writer (T097) writes per-event objects + manifests; derived (T098) writes summary-{rev}.json revisions; but nothing writes the finalized summary.json with phase durations. A later integration (connecting the execute/govern lifecycle end-of-run to the archive) must produce it, or history/timings stay permanently empty. Surfaced by T101 during 036 Phase 7; read-side is correct + tested, write-side is the gap.
<!-- SECTION:DESCRIPTION:END -->
