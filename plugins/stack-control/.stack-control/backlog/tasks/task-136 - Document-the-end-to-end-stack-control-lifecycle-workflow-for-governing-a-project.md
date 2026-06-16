---
id: TASK-136
title: >-
  Parseable, deterministic stack-control lifecycle workflow that drives items
  through phases (not just documentation)
status: Done
assignee: []
created_date: '2026-06-15 20:50'
updated_date: '2026-06-16 04:49'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
references:
  - the 2026-06-15 session improvised the full arc with no documented playbook
ordinal: 136000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stack-control ships the lifecycle PIECES as individual skills/verbs (session-start, inbox/insight-capture, backlog capture/promote, roadmap reason/curate/reconcile, define/speckit authoring, govern/audit-barrage, execute, release, session-end) but there is NO single well-documented workflow that ties them into the MACRO lifecycle of a stack-control-governed project. The intended arc: session-start orientation -> capture found work to the backlog (capture != scope) -> promote earned items into the roadmap -> author specs (define -> speckit) -> govern the spec then the implementation (cross-model audit-barrage) -> execute -> release -> post-release+install resolution cycle (verify the installed release, close resolved items) -> roadmap reconcile/advance -> session-end. Today's session improvised exactly this sequence (reconcile -> unorphan -> merge -> PR -> CI-fix -> release-verify -> close -> promote) by force of will, with no canonical playbook to follow or to hand a fresh agent. Desired: a canonical, well-documented governing workflow — a top-level WORKFLOW.md / lifecycle doc (peer to THESIS.md) and likely an orchestrating skill — that an operator or fresh agent follows to run a project's whole lifecycle, with each phase pointing at the verb/skill that executes it and the gates between phases. Grounds the thesis ('industrialize execution') at the macro/process layer.

SHARPENED (operator 2026-06-15): this is NOT just a WORKFLOW.md doc — the lifecycle must be an ACTUAL PARSEABLE workflow that the tooling can DETERMINISTICALLY DRIVE ITEMS THROUGH. Apply the roadmap-protocol pattern to the process itself: a governed, grammar-parsed workflow document (doc-grammar, like the roadmap DAG) defining the phases, the per-phase entry/exit gates, and the verb/skill that executes each phase; plus an engine that, given an item, knows its current phase, the gate conditions to advance, and deterministically drives it to the next phase (or reports why it's blocked). The human-readable WORKFLOW.md is one RENDERING of that parseable definition, not the source of truth. So an operator or fresh agent (or an unattended run) can drive an item through capture -> promote -> author -> govern -> execute -> release -> resolve -> close mechanically, with the gates enforced, rather than improvising the sequence by force of will. Reuses document-primitives (governed parseable doc engine) + the roadmap-protocol grammar/DAG reasoning. Umbrella: multi:feature/lifecycle-industrialization; sibling mechanization pieces TASK-134 (post-release resolution), TASK-135 (backlog->roadmap promotion), TASK-133 (unorphan assist).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** roadmap:multi:feature/parseable-lifecycle-workflow
<!-- SECTION:NOTES:END -->
