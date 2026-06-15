---
id: TASK-136
title: >-
  Document the end-to-end stack-control lifecycle workflow for governing a
  project
status: To Do
assignee: []
created_date: '2026-06-15 20:50'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - the 2026-06-15 session improvised the full arc with no documented playbook
ordinal: 136000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stack-control ships the lifecycle PIECES as individual skills/verbs (session-start, inbox/insight-capture, backlog capture/promote, roadmap reason/curate/reconcile, define/speckit authoring, govern/audit-barrage, execute, release, session-end) but there is NO single well-documented workflow that ties them into the MACRO lifecycle of a stack-control-governed project. The intended arc: session-start orientation -> capture found work to the backlog (capture != scope) -> promote earned items into the roadmap -> author specs (define -> speckit) -> govern the spec then the implementation (cross-model audit-barrage) -> execute -> release -> post-release+install resolution cycle (verify the installed release, close resolved items) -> roadmap reconcile/advance -> session-end. Today's session improvised exactly this sequence (reconcile -> unorphan -> merge -> PR -> CI-fix -> release-verify -> close -> promote) by force of will, with no canonical playbook to follow or to hand a fresh agent. Desired: a canonical, well-documented governing workflow — a top-level WORKFLOW.md / lifecycle doc (peer to THESIS.md) and likely an orchestrating skill — that an operator or fresh agent follows to run a project's whole lifecycle, with each phase pointing at the verb/skill that executes it and the gates between phases. Grounds the thesis ('industrialize execution') at the macro/process layer. Umbrella over the mechanization pieces TASK-134 (post-release resolution) and the backlog->roadmap promotion mechanization.
<!-- SECTION:DESCRIPTION:END -->
