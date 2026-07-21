---
id: TASK-476
title: instance-requires-events-not-heartbeat
status: To Do
assignee: []
created_date: '2026-07-21 06:01'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - plugins/stack-control/src/plane/instance-registry.ts
ordinal: 475000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A connected+enrolled sidecar that emits only session-liveness heartbeats never appears in /v1/instances. buildInstanceRegistry folds invocation/run EVENTS into one accumulator per host:path; heartbeats are only injected onto accumulators that already exist from events. So a bare sidecar (no stackctl activity in its install) heartbeats (accepted 200) but is invisible. Breaks the 'start a sidecar -> see an instance' expectation. Decide: should a live heartbeat alone surface an instance (attached/idle), or is event-derived-only intended? Surfaced dogfooding 037.
<!-- SECTION:DESCRIPTION:END -->
