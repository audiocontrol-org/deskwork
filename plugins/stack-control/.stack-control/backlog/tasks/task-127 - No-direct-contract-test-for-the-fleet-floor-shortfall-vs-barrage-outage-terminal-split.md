---
id: TASK-127
title: >-
  No direct contract test for the fleet-floor-shortfall vs barrage-outage
  terminal split
status: To Do
assignee: []
created_date: '2026-06-15 00:42'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
021 phase-5 audit, codex-gpt5 MEDIUM. The T028 split (barrage nonzero → fleet-floor-shortfall when stderr has the anchored FLOOR SHORTFALL line, else barrage-outage) has no direct e2e/contract test. govern-terminal-outcomes covers graduated/blocked/negotiation-failed/usage but not the two barrage-nonzero kinds. Add stub-barrage cases that exit nonzero with vs without the 'audit-barrage: FLOOR SHORTFALL —' line and assert terminal-outcome=fleet-floor-shortfall vs barrage-outage.
<!-- SECTION:DESCRIPTION:END -->
