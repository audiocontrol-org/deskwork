---
id: TASK-300
title: >-
  028 design consideration: CommandDescriptor flat shape vs discriminated union
  (single/multi-action)
status: To Do
assignee: []
created_date: '2026-06-19 16:58'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 300000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AUDIT-BARRAGE-claude-02 (028 Phase 1 govern). CommandDescriptor (src/cli-help/command-surface.ts) carries mediationClass + flags as unconditionally-present even for multi-action verbs, where they are semantically undefined (per-sub-action class applies instead). A discriminated union (kind: single | multi) would make mediation mis-classification mechanically impossible for a multi-action verb. Routed to backlog (not fixed in-loop) because it deviates from the analyze-clean data-model.md section 1, which deliberately chose the flat shape; the planned Phase 2 guards (T007 completeness, T009 unclassified-node fail-loud) mitigate the runtime risk; and a type-shape change ripples across all 028 phases. Operator owns the deviate-vs-keep call.
<!-- SECTION:DESCRIPTION:END -->
