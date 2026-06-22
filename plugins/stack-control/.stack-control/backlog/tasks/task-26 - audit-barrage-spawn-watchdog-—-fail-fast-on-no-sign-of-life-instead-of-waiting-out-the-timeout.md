---
id: TASK-26
title: >-
  audit-barrage: spawn watchdog — fail fast on no sign-of-life instead of
  waiting out the timeout
status: Done
assignee: []
created_date: '2026-06-11 04:40'
updated_date: '2026-06-22 17:24'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
references:
  - >-
    audiocontrol repo e2e testing infrastructure (existing watchdog
    implementation to borrow)
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A barrage model spawn that produces no output can only die by the full timeout_seconds SIGTERM today — the orchestrator waits like a dummy for the cap even when the child has shown no sign of life. Add a watchdog that monitors heartbeat/sign-of-life (e.g. stdout/stderr activity, or stream-json events when available) and fails the spawn fast when none appears within a liveness window. There is an existing implementation in the audiocontrol repo's e2e testing infrastructure to borrow. Context: 2026-06-10 design-control timeouts (17 consecutive exit-143 runs); note the converse case also exists — claude -p in text mode emits nothing until completion, so the liveness signal may need stream-json or stderr-based heartbeats. Related roadmap items: multi:gap/audit-barrage-model-pinning, multi:gap/audit-barrage-timeout-observability.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** spec:specs/014-audit-barrage-reliability
<!-- SECTION:NOTES:END -->
