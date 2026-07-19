---
id: TASK-458
title: >-
  036 command dispatch held-map keyed by commandId alone loses all-but-last
  target for fleet-wide replay-on-reconnect
status: To Do
assignee: []
created_date: '2026-07-17 18:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 457000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
T070 dispatch.ts CommandDispatch.held is keyed by commandId only. A fleet-wide command (T071 issueFleetCommand) held across N disconnected targets under one shared commandId keeps only the LAST hold() for replayOnReconnect — the other targets' holds are overwritten. Single-target replay (command-blip T058) works and is green; multi-target fleet replay is the gap. Fix: key held by (commandId, installationId) or mint per-target sub-records when the per-target fleet delivery/replay wiring is built. Surfaced by T071 during 036 Phase 5; no current test exercises multi-target replay so nothing is red, but SC-007 (a cancel surviving a blip) applied fleet-wide would silently drop all but one target on reconnect.
<!-- SECTION:DESCRIPTION:END -->
