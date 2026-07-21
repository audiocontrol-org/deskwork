---
id: TASK-477
title: dashboard-bearer-startup-snapshot
status: To Do
assignee: []
created_date: '2026-07-21 06:01'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - plugins/stack-control/src/dashboard/serve.ts
ordinal: 476000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The dashboard injects ONE plane bearer into the page, read once from acceptedTokens at serve startup (buildDashboardRoutes: [...keys][0]). If no telemetry token existed at startup, the page gets null and cannot call the authed /v1/* API -> dashboard shows nothing until the plane is restarted after an instance enrolls. Also frozen to whichever single token was first. Consider a dashboard-scoped read token minted at startup, or re-resolving per request. Surfaced dogfooding 037.
<!-- SECTION:DESCRIPTION:END -->
