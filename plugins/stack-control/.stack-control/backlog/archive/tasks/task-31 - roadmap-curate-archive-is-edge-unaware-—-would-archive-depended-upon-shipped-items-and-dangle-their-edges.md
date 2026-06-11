---
id: TASK-31
title: >-
  roadmap curate/archive is edge-unaware — would archive depended-upon shipped
  items and dangle their edges
status: To Do
assignee: []
created_date: '2026-06-11 00:50'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-436
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
curate/archive would archive a shipped item still referenced by a depends-on edge and dangle it; roadmap archival must be edge-aware (skip terminal items that are still depends-on/part-of targets). Owning surface: design:feature/roadmap-protocol. Migrated 2026-06-11 from roadmap node design:gap/roadmap-edge-aware-archival (originating issue gh-436, closed).
<!-- SECTION:DESCRIPTION:END -->
