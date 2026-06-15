---
id: TASK-131
title: >-
  roadmap reconcile reports 15 orphan spec dirs (incl. fully-implemented 021)
  with no roadmap node
status: To Do
assignee: []
created_date: '2026-06-15 16:52'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - 'plugins/stack-control: roadmap reconcile correspondence'
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed 2026-06-15: stackctl roadmap reconcile lists 15 orphan spec dirs (007-insight-capture .. 021-audit-protocol-friction-burndown) with 'unresolved correspondences: 0' — i.e. these numbered spec dirs map to NO roadmap node. 021 is fully implemented (32/32 tasks, clean tree) yet has no roadmap representation, so reconcile cannot advance it to shipped and the roadmap silently understates shipped work. Either the numbered-dir <-> codename-key (design:feature/X) correspondence resolver is missing matches, or implemented specs were never registered as roadmap nodes. Repro: run stackctl roadmap reconcile.
<!-- SECTION:DESCRIPTION:END -->
