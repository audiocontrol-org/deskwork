---
id: TASK-457
title: >-
  036 registry drops snapshot payload — per-run detail cannot surface
  snapshot-derived facets when producers land
status: To Do
assignee: []
created_date: '2026-07-17 18:34'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 456000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
T050 buildRegistry consumes ClassifiedEvent {envelope, classification, type}, discarding the TelemetryEvent.snapshot payload. So FleetEntry carries only envelope-derived fields (runId/installationId/invocationId/statusAxes/progress/availableActions/timings). T054 perRunDetail therefore honestly omits the C5 facets artifacts/model/git/governance/reconciliation (no fabrication — the data isn't in the entry). When their producers land in later phases (artifacts: archive pipeline T097-T101; reconciliation: US3 T065/T072; governance: govern subsystem), the registry/ClassifiedEvent MUST be extended to thread the bounded snapshot payload, or per-run detail will never carry those facets. Surfaced during 036 Phase 4 execute; validateArtifactRef (src/fleet/artifact.ts) is implemented+tested but not yet called from api.ts for the same reason.
<!-- SECTION:DESCRIPTION:END -->
