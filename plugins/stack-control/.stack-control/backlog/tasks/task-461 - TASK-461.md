---
id: TASK-461
title: TASK-461
status: To Do
assignee: []
created_date: '2026-07-17 22:57'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 460000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
036 sidecar daemon: consumed commands (onCommand / command SSE frames) are not routed back to a local run over the socket — register-run/end-invocation frames are received but not fanned in. Affects full Scenario 3 (cooperative pause/cancel APPLIED to a running invocation). Command delivery + plane-side requested-vs-applied status work; the sidecar->local-run command fan-in is unwired.
<!-- SECTION:DESCRIPTION:END -->
