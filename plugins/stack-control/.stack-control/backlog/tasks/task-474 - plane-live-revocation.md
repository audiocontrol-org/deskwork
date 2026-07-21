---
id: TASK-474
title: plane-live-revocation
status: Done
assignee: []
created_date: '2026-07-21 03:26'
updated_date: '2026-07-21 04:34'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - docs/superpowers/specs/2026-07-20-fleet-multihost-enrollment-design.md
ordinal: 473000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
plane revoke is restart-effective only: it writes enrollment.json but the running plane snapshots its accepted set at serve startup and never re-reads, so a revoked telemetry token keeps working until the next serve. Enroll is live (same-process map mutation); revoke is not. Revocation latency has a security dimension. Design Scope-Boundary already names live registry reload (SIGHUP/file-watch) as the follow-on. Surfaced by 037 multi-host enrollment final review.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed in 6a45604a: plane reloads enrollment.json before every auth/enroll; revocation is live (no restart).
<!-- SECTION:NOTES:END -->
