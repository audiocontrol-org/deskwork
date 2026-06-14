---
id: TASK-81
title: >-
  AUDIT-20260614-23 — Fleet capability load errors bypass govern’s FATAL exit
  channel
status: Done
assignee: []
created_date: '2026-06-14 18:32'
labels:
  - 'type:migrated-finding'
  - 'feature:audit-protocol-friction-burndown'
  - 'finding:AUDIT-20260614-23'
dependencies: []
references:
  - 'audit:audit-protocol-friction-burndown:AUDIT-20260614-23'
priority: medium
ordinal: 81000
---

Fixed in `ca0b373e`: `loadLaneCapabilitiesGoverned()` in `src/govern/protocol.ts`
normalizes lane-capability load failures onto the `govern: FATAL —` channel; both
call sites (implement-mode preflight + spec/loop path) route through it. The
round-3 phase-1 barrage (`20260614T183124634Z`) re-audited the surface and both
lanes returned clean, explicitly confirming the FATAL-channel routing. Stale-open
dupe of a same-session fix; closed on triage.

