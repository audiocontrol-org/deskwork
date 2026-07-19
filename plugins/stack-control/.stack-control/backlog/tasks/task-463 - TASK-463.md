---
id: TASK-463
title: TASK-463
status: To Do
assignee: []
created_date: '2026-07-17 22:57'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 462000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
036 sidecar daemon drain loop drains the WAL unbounded — the FR-017 spool-cap drop-policy (selectDropVictims, built T037/T040) is not wired into the drain. Under sustained plane-unreachable backpressure the spool grows without the short/long asymmetry bound. Wire selectDropVictims into daemon.ts drain.
<!-- SECTION:DESCRIPTION:END -->
