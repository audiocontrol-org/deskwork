---
id: TASK-475
title: instance-identity-unstable-hostname
status: Done
assignee: []
created_date: '2026-07-21 06:01'
updated_date: '2026-07-21 06:23'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - plugins/stack-control/src/machine-state/instance-id.ts
ordinal: 474000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Instance identity host:path uses os.hostname(), which is UNSTABLE on macOS with Tailscale: observed it flip from orion-m1.local to orion-m4.tail8254f4.ts.net within one session (Tailscale drives gethostname; scutil HostName is unset). The same installation therefore fragments into multiple instances over time, and a sidecar's live heartbeat (current hostname) fails to match its own earlier-registered instance (old hostname). Pin instance identity to a stable per-host id (e.g. a persisted machine id) instead of os.hostname(). Surfaced dogfooding 037.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: INVALID — I conflated two separate hosts. orion-m1 and orion-m4 are different Macs (M1 and M4), not one host with a flipping hostname. orion-m1 is a real remote tailnet peer (100.96.71.14) connected to the plane. No hostname instability; os.hostname() is stable per host.
<!-- SECTION:NOTES:END -->
