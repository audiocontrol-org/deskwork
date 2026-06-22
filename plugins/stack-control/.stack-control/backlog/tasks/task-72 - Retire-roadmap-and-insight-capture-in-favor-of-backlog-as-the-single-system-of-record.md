---
id: TASK-72
title: >-
  Retire roadmap and insight capture in favor of backlog as the single system of
  record
status: Done
assignee: []
created_date: '2026-06-14 01:47'
updated_date: '2026-06-22 17:24'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Roadmap and insight-capture currently overlap with backlog as work-tracking/capture mechanisms. In practice this creates operator confusion about which surface is authoritative and where new work should live. The backlog mechanism is the better surface and should become the sole system of record for captured work.

Desired outcome:
- retire the roadmap mechanism as a parallel work-tracking surface
- retire the insight-capture/inbox mechanism as a parallel capture surface
- migrate any necessary semantics or affordances into backlog
- document backlog as the single authoritative queue / system of record
- remove or deprecate the redundant verbs, docs, and workflows so agents and operators are not asked to choose among overlapping systems
<!-- SECTION:DESCRIPTION:END -->
