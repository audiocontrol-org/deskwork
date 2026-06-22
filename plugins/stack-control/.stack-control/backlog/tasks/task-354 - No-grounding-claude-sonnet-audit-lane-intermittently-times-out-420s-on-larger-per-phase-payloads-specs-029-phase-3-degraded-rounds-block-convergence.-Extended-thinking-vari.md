---
id: TASK-354
title: >-
  No-grounding claude/sonnet audit lane intermittently times out (>420s) on
  larger per-phase payloads (specs/029 phase-3) -> degraded rounds block
  convergence. Extended-thinking varies run-to-run. Consider
  payload-scaled/adaptive per-lane timeout (US1 follow-on).
status: To Do
assignee: []
created_date: '2026-06-20 10:39'
updated_date: '2026-06-20 10:39'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 354000
---



## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-scoped 2026-06-22: per-phase payload framing is obsolete (per-phase govern deleted by 030). Surviving gap: the liveness window is not payload-scaled — whole-feature chunk payloads can be just as large as the per-phase payloads that triggered the timeout. timeout-derivation.ts scales the floor but not the liveness window; the fixed 300s window leaves extended-thinking models vulnerable on large chunks. Fix: scale the per-lane liveness window proportionally to estimated payload size (or adopt the adaptive mechanism that timeout_secs_per_kb already provides for floor). Near-duplicate of TASK-324 root (same file: timeout-derivation.ts); consider folding.
<!-- SECTION:DESCRIPTION:END -->
