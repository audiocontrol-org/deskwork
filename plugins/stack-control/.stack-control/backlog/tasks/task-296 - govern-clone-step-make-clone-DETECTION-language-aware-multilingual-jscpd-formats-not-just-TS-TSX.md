---
id: TASK-296
title: >-
  govern clone-step: make clone DETECTION language-aware (multilingual jscpd
  formats), not just TS/TSX
status: To Do
assignee: []
created_date: '2026-06-19 06:15'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 296000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-on to TASK-295 (the non-fatal-on-zero-files fix that unblocked non-TS adopters by making govern proceed). That fix left clone DETECTION TS/TSX-only: a non-TypeScript adopter (offing Bash/PHP/WordPress) gets govern working but no clone advisory at all. This item is the OTHER option the roadmap node impl:fix/govern-clone-step-language-agnostic listed: detect/extend jscpd --format so common adopter languages (php, bash, python, go, java, etc.) are actually scanned for duplication. Deferred by operator 2026-06-19 (chose non-fatal-only for the customer unblock). Blast radius to scope before doing: which formats to enable, per-adopter clones.yaml baseline churn when new non-TS groups surface, and whether format selection should auto-detect from the tree vs a fixed broad list.
<!-- SECTION:DESCRIPTION:END -->
