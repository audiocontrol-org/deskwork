---
id: TASK-454
title: >-
  033 AUDIT-02 follow-up: host-capability accepted-model resolver (Codex
  tier_map)
status: To Do
assignee: []
created_date: '2026-06-29 03:09'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 453000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move accepted-model validation behind a dispatch-surface capability resolver so a Codex host can configure Codex-valid model keywords in tier_map. Today the Claude Code subagent set (haiku|sonnet|opus|fable) is hardcoded in src/execute/accepted-models.ts and config-loader rejects out-of-range values at load (FR-008/D4). Build when the Codex port is actually exercised (Principle II); resolves spec assumption U1. Source: end-govern AUDIT-20260629-02 (codex HIGH), overridden 2026-06-29 per operator decision.
<!-- SECTION:DESCRIPTION:END -->
