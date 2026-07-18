---
id: TASK-471
title: >-
  036 short-verb invocation.completed CLI→sidecar→plane delivery not
  demonstrated (empty spool WAL after live verb runs)
status: To Do
assignee: []
created_date: '2026-07-18 16:52'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - src/telemetry/invocation-telemetry.ts
ordinal: 470000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Live dogfood 2026-07-18: with a real sidecar elected (socket bound) and plane serving, ran 'stackctl version' three times. Afterward the sidecar spool WAL (durableDir/spool/spool.wal) was 0 bytes and the plane showed no evidence of receiving the invocation.completed events; /v1/health/store reported uplink status 'disabled' (unconfigured — no successes recorded). Could not confirm the CLI→sidecar emit delivered, nor the sidecar→plane uplink. Candidate causes to investigate: (a) fail-open emit for a fast verb races process exit before the socket write flushes; (b) uplink/health signals simply not populated in a bare 'plane serve' (serve-wiring gap, not a delivery bug); (c) short-verb invocation.completed intentionally dropped somewhere. Note aggregated invocation.completed would NOT appear in GET /v1/fleet regardless (correct), and there is no API surface exposing short-verb summaries to confirm receipt — so end-to-end delivery of the every-invocation-emits path (FR-012) is currently unverifiable from the outside. Related to TASK-470 (the producer gap) but distinct: this is about the invocation.completed path that IS wired. Scope: determine whether this is a real delivery defect or a health-wiring/observability gap, and add a way to verify FR-012 delivery end-to-end.
<!-- SECTION:DESCRIPTION:END -->
