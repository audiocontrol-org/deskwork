---
id: TASK-469
title: TASK-469
status: To Do
assignee: []
created_date: '2026-07-18 14:21'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 468000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
036 src/plane/runtime.ts is 523 lines (over the 500 cap, Principle VI) after the AUDIT-45 security enforcement (+23; was at 500). Split the 3 sidecar-facing handlers (ingest/liveness/stream) into a createSidecarHandlers(deps) module threading ingestState/eventLog/events/durableStore/uplinkSignals/dispatch/scheduler. Deliberately not bundled with the focused security patch.
<!-- SECTION:DESCRIPTION:END -->
