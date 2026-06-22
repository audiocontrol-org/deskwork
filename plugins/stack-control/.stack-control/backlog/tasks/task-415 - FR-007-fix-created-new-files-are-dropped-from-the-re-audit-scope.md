---
id: TASK-415
title: FR-007 fix-created new files are dropped from the re-audit scope
status: To Do
assignee: []
created_date: '2026-06-22 00:06'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - dogfood-030-2026-06-21-fr007-newfiles
ordinal: 415000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
030 dogfood (chunk run 233622298Z): when a fix round creates NEW files, real runs silently drop them from the re-audit scope, so the loop can terminate without auditing fix output.
<!-- SECTION:DESCRIPTION:END -->
