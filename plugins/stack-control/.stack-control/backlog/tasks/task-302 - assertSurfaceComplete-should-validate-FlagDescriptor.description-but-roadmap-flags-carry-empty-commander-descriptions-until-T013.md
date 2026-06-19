---
id: TASK-302
title: >-
  assertSurfaceComplete should validate FlagDescriptor.description, but roadmap
  flags carry empty commander descriptions until T013
status: To Do
assignee: []
created_date: '2026-06-19 18:21'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 302000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AUDIT-BARRAGE-claude-02 (028 Phase 2 govern). The command-surface completeness guard (src/cli-help/command-surface.ts assertSurfaceComplete) checks verb + sub-action descriptions but NOT flag descriptions, so a flag with an empty description renders a blank help/verb-reference row silently. Correct fix is to extend the guard to require flag.description non-empty. BLOCKED until T013: roadmap's commander options are currently registered without description strings (roadmap-command.ts registerSubaction: sub.option('--<flag> <value>') with no desc) — the descriptions live in roadmap-help.ts flagLine(). Adding flag-description validation now would make buildCommandSurface throw for every roadmap flag. T013 (US1, 'verify roadmap renders from the surface; adapt if a gap') must first move/populate roadmap flag descriptions onto the commander tree; THEN the guard can enforce flag descriptions. Scope into T013.
<!-- SECTION:DESCRIPTION:END -->
