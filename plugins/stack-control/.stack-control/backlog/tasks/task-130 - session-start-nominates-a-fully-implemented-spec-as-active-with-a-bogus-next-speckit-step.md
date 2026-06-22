---
id: TASK-130
title: >-
  session-start nominates a fully-implemented spec as 'active' with a bogus next
  /speckit-* step
status: Done
assignee: []
created_date: '2026-06-15 16:52'
updated_date: '2026-06-22 17:24'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - 'plugins/stack-control: session-start active-spec inference'
ordinal: 130000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed 2026-06-15: session-start reported specs/021-audit-protocol-friction-burndown as the active spec with 'next: /speckit-analyze' even though all 32 tasks are checked [X] and the tree is clean. The next-step inference reads .specify/feature.json as a cursor and never detects an exhausted chain (authoring+impl complete). A finished feature should not be nominated as the active spec, and certainly not with a downstream /speckit-* step to run. Repro: run stackctl session-start with feature.json pointing at a 100%-complete spec.
<!-- SECTION:DESCRIPTION:END -->
