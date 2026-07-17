---
id: TASK-460
title: TASK-460
status: To Do
assignee: []
created_date: '2026-07-17 22:19'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 459000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
036 T113 reconnect driver: runReconnectingSseClient uses attempt-indexed backoff but does not wire ReconnectBackoff.reseedBaseFromServerRetry (server retry: hint) or noteHealthyFor (60s-healthy reset) into the live path (contract C4). Both primitives are built + unit-tested in backoff.test.ts; wiring needs the frame's retry: field surfaced through the sse-client onEvent callback (a deliberate additive client change) and a healthy-duration tracker in the driver. Core reconnect (backoff + Last-Event-ID + terminal-stop) is complete and tested.
<!-- SECTION:DESCRIPTION:END -->
