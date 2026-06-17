---
id: TASK-152
title: >-
  025 FR-002: start-governing (implementing->governing) gate is authored in
  WORKFLOW.md but the 024 advance engine treats mid-pipeline transitions as
  advisory, so all-phase-checkpoints-current is reported-not-enforced there
status: To Do
assignee: []
created_date: '2026-06-17 01:48'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AUDIT-BARRAGE codex-01 (HIGH), 025 phase-1 re-govern 2026-06-17. WORKFLOW.md transition:start-governing carries 'all-phase-checkpoints-current impl' (FR-002), but src/workflow/transition-engine.ts + workflow.ts only REFUSE the terminal governing->shipped transition; mid-pipeline advances are advisory (a 024 migration design choice — see advance-gate-enforcement.test.ts 'mid-pipeline stays advisory'). Effect: an agent running raw 'workflow advance' can ENTER governing without per-phase checkpoints. BOUNDED: US2's execute cadence writes the checkpoints during implementing, and the graduate gate (enforced) blocks shipping — defense-in-depth holds, codex notes 'not a total bypass'. Fork (operator): enforce start-governing too (changes the 024 advisory-mid-pipeline design) vs accept graduate-gate-as-teeth + honest boundary (FR-017). If fixing: make implementing->governing an enforced gate in the advance path, with a test.
<!-- SECTION:DESCRIPTION:END -->
