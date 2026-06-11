---
id: TASK-33
title: >-
  governance graduation has no on-disk record; roadmap reconcile falls back to
  tasks-completion as the shipped signal
status: To Do
assignee: []
created_date: '2026-06-11 00:50'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-434
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Governance graduation has no on-disk record (the gate prints true/false, persists nothing); roadmap reconcile falls back to tasks-completion as the shipped signal. Persist a per-spec graduation record, then strengthen reconcile to require it. Owning surface: design:feature/spec-governance. Migrated 2026-06-11 from roadmap node design:gap/governance-graduation-record (originating issue gh-434, closed).
<!-- SECTION:DESCRIPTION:END -->
