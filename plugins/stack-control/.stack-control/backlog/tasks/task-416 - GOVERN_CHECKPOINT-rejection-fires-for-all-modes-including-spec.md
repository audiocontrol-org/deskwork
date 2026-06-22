---
id: TASK-416
title: GOVERN_CHECKPOINT rejection fires for all modes including spec
status: To Do
assignee: []
created_date: '2026-06-22 00:06'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - dogfood-030-2026-06-21-checkpoint-spec
ordinal: 416000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
030 dogfood (chunk run 232806229Z): the 030 clean-break GOVERN_CHECKPOINT-retired rejection is not mode-scoped; it over-fires in spec mode where a checkpoint label is still legitimate.
<!-- SECTION:DESCRIPTION:END -->
