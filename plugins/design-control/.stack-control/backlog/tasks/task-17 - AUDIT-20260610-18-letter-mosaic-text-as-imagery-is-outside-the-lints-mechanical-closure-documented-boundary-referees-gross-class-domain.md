---
id: TASK-17
title: >-
  AUDIT-20260610-18: letter-mosaic text-as-imagery is outside the lint's
  mechanical closure (documented boundary; referee's gross-class domain)
status: To Do
assignee: []
created_date: '2026-06-10 20:18'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - >-
    specs/001-design-control/audit-log.md AUDIT-20260610-18 (round-4
    gpt-5-codex-01
  - HIGH); boundary fixture in codepoint.test.ts
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A wordmark mosaic of one allowlisted letter per table cell (0% punctuation) renders imagery the density gate cannot see; single-char-cell heuristics collide with legitimate Y/N feature matrices. Dispositioned as claim-narrowing: lint docstring + adversarial prompt now declare the boundary and assign the class to the referee (PRD gross classes 5-7). Selectable if the operator wants a heuristic attempt despite the matrix-collision cost.
<!-- SECTION:DESCRIPTION:END -->
