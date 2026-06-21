---
id: TASK-290
title: >-
  cluster.test.ts uses non-null (!) assertions (model.byId.get(id)!) — banned by
  the strict-typing rule
status: Done
assignee: []
created_date: '2026-06-19 03:13'
updated_date: '2026-06-21 03:14'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 290000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/roadmap/cluster.test.ts (Phase-4 subagent code) carries several model.byId.get('...')! non-null assertions (lines ~79-81, 103, 106-107, 223). The project rule bans ! (TASK-166 class). A get-or-throw item(model,id) helper exists in the file; convert the remaining ! to it. Low-stakes test hygiene; source-side ! were fixed in cluster.ts during the Phase-4 govern round.
<!-- SECTION:DESCRIPTION:END -->
