---
id: TASK-465
title: TASK-465
status: To Do
assignee: []
created_date: '2026-07-18 02:53'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 464000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
036 govern round-2 AUDIT-20260718-12: 'sidecar run' honors only --plane-url/STACKCTL_CP_URL; a config-file plane.url is a KNOWN GAP that fails through the loader, so an operator who configures the installation and runs sidecar run gets an idle spooler with no uplink. Same root as TASK-462 (config loader omits plane from KNOWN_TOP_LEVEL). Fix: honor config plane.url OR reject with an actionable error instead of starting an idle daemon.
<!-- SECTION:DESCRIPTION:END -->
