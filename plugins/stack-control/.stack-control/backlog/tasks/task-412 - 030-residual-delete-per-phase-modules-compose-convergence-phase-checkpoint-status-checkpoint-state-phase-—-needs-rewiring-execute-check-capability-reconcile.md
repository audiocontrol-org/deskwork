---
id: TASK-412
title: >-
  030 residual: delete per-phase modules (compose-convergence,
  phase-checkpoint-status, checkpoint-state phase) — needs rewiring
  execute-check + capability-reconcile
status: To Do
assignee: []
created_date: '2026-06-21 20:45'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - 'specs/030-chunked-end-govern/spec.md:FR-017'
ordinal: 412000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The functional clean break is done (per-phase govern path + gate + flags gone; full suite green). Full SC-002 (0 per-phase surfaces) needs the per-phase MODULES deleted: compose-convergence.ts, phase-checkpoint-status.ts, checkpoint-state.ts (phase parts), incremental-audit.ts (phase parts). They are still consumed by execute-check.ts (assertPhaseFitsFleet + the per-phase boundary/implement-hook) and capability-reconcile.ts (026 per-phase un-governed reporting) — both obsolete with per-phase gone but with their own tests. Rewire those two features, then delete the modules + T031 phase-checkpoints doctor/schema + T033 compass per-phase arms.
<!-- SECTION:DESCRIPTION:END -->
