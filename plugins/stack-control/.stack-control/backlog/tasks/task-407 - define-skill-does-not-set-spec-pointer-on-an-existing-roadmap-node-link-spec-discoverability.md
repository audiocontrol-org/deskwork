---
id: TASK-407
title: >-
  define skill does not set spec pointer on an existing roadmap node (link-spec
  discoverability)
status: To Do
assignee: []
created_date: '2026-06-21 16:58'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - plugins/stack-control/skills/define/SKILL.md
ordinal: 407000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro: run /stack-control:define for a feature whose roadmap node already exists (the capture-fusion node-exists branch). The skill compass-gates and authors the spec, but never sets the node's spec: pointer, so the node can stay spec-pointerless (the TASK-244 class — govern --item and reconcile then cannot authoritatively resolve the feature). Workaround: manually run 'stackctl workflow link-spec <item> specs/NNN-<slug> --apply' after /speckit-specify (this is what was done for 030-chunked-end-govern this session). Note 'roadmap add --spec' does NOT work on an existing node — it errors on the identifier uniqueness invariant. Suggested-fix: the define node-exists branch should instruct (or the verb should auto-run) workflow link-spec once /speckit-specify resolves the new spec dir, mirroring how the no-node branch passes --spec to roadmap add. Surfaced as session friction 2026-06-21 while authoring 030 through the front door.
<!-- SECTION:DESCRIPTION:END -->
