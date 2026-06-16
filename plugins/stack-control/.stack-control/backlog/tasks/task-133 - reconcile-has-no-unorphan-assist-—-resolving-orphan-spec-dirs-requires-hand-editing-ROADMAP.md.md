---
id: TASK-133
title: >-
  reconcile has no unorphan assist — resolving orphan spec dirs requires
  hand-editing ROADMAP.md
status: To Do
assignee: []
created_date: '2026-06-15 20:39'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - follow-on from TASK-131; plugins/stack-control/src/roadmap/reconcile.ts
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from TASK-131 (orphan CONDITION resolved in v0.47.0 by hand-adding spec: fields + nodes). The residual TOOLING gap: stackctl roadmap reconcile only REPORTS orphan spec dirs; resolving them means hand-editing ROADMAP.md (adding a spec: field to an existing node, or authoring a new node). Candidate: a reconcile --apply-orphans / roadmap unorphan verb that proposes, per orphan dir, either (a) attach spec: to the best-matching existing node (numbered-dir <-> codename-key heuristic) or (b) scaffold a new node at the dir's inferred status (tasks-complete -> shipped). Propose-then-apply, mirroring the rest of the roadmap mutation verbs.
<!-- SECTION:DESCRIPTION:END -->
