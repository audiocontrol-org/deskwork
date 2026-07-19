---
id: TASK-470
title: >-
  036 run-lifecycle producer unwired — no verb emits
  run.started/progress/completed, so execute/govern never register as
  commandable fleet instances (FR-013 has no live source)
status: To Do
assignee: []
created_date: '2026-07-18 16:51'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - specs/036-fleet-control-plane/spec.md
ordinal: 469000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Live dogfood 2026-07-18: booted real plane + sidecar, ran real stackctl verbs, GET /v1/fleet stayed empty. Root cause: nothing in the CLI emits run-lifecycle events. Only src/plane (registry/ingest/classification) references run.started; the CLI telemetry wrapper (src/telemetry/invocation-telemetry.ts) emits ONLY invocation.completed (runId null, classification aggregated, which src/plane/registry.ts explicitly discards). execute-check.ts and govern.ts do not import the emit client for run lifecycle. So FR-013 (execute/govern MUST register as commandable instances) is satisfied only by synthetic events in tests. This is the load-bearing gap under the whole feature: TASK-457 (per-run snapshot facets) and TASK-459 (history/timings write-side) both PRESUME producers ('when producers land' / 'a later integration must produce it') but neither builds them, and no other item does. Also blocks design:feature/fleet-dashboard, whose stated depends-on precondition is 'the plane producing real fleet state'. Verified-good: the plane's aggregation/per-run/command lifecycle all work when fed real run.started/progress/completed through the actual /v1/ingest boundary. Scope: wire execute/govern (and any long-running interruptible verb) to emit run.started/progress/completed with a bounded snapshot payload.
<!-- SECTION:DESCRIPTION:END -->
