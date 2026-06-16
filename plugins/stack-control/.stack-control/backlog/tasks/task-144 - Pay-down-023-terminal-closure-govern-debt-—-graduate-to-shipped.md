---
id: TASK-144
title: Pay down 023 terminal-closure govern debt — graduate to shipped
status: To Do
assignee: []
created_date: '2026-06-16 15:51'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
023 (impl:feature/terminal-closure) sits in phase governing with an unmet graduate gate: record-converged impl is 0/1 (no convergence record on disk; only 024 has one). The close-related verb was implemented (tasks T001-T004 all done), shipped in v0.49.0, and used in anger (closed 022 TASK-136/19 and 024 TASK-83/139) — but the 023 diff itself was never governed. To close out honestly: stackctl govern the 023 diff (retroactive; already merged in v0.49.0, so diff-base needs a look), converge, graduate through the gate, then close-related (likely reports no recorded resolved items). Parked 2026-06-16 to prioritize unskippable-workflow-protocol design.
<!-- SECTION:DESCRIPTION:END -->
