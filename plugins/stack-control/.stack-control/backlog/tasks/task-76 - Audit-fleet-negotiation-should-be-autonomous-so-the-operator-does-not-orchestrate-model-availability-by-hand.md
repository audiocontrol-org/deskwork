---
id: TASK-76
title: >-
  Audit fleet negotiation should be autonomous so the operator does not
  orchestrate model availability by hand
status: To Do
assignee: []
created_date: '2026-06-14 02:14'
updated_date: '2026-06-14 02:14'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The audit orchestrator should own more of the fleet negotiation and preflight work. Today the operator has to discover unavailable models, probe candidate replacements, and debug lane reliability manually. Stack-control should validate lane binaries, model availability for the current account/provider, trivial prompt completion, and liveness behavior before a real govern run, and should surface or negotiate an actually usable fleet without polluting remediation context with manual fleet-configuration debugging.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/021-audit-protocol-friction-burndown
<!-- SECTION:NOTES:END -->
