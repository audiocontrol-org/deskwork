---
id: TASK-467
title: TASK-467
status: To Do
assignee: []
created_date: '2026-07-18 14:15'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 466000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
036 govern round-4 AUDIT-20260718-46: command expiry is transitioned only as a side effect of replayOnReconnect, so a command for an installation that never reconnects never visibly expires (needs a periodic expiry sweep independent of reconnect). Deferred from the round-4 override; related to the folded command-lifecycle wiring TASK-461/464.
<!-- SECTION:DESCRIPTION:END -->
