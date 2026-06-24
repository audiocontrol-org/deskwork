---
id: TASK-445
title: >-
  031 close-gate coherence: workflow status/compass report a graduated item as
  phase shipped (derived from the convergence record) with closed as the next
  move, but advance --to closed refuses because the recorded roadmap status is
  still in-flight - the derived-phase surface and the raw-status close gate
  disagree in the graduated-but-not-status-shipped window
status: Done
assignee: []
created_date: '2026-06-23 16:28'
updated_date: '2026-06-24 16:33'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 444000
---

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Dissolved by construction in 032 (US2 coherence): post-merge phases derive from the recorded status — the same source the close gate reads — so the derived-phase surface and the raw-status close gate cannot disagree. The src/__tests__/workflow/coherence-no-divergence.test.ts cases prove the graduated-but-not-status-shipped divergence no longer reproduces. Shipped in 0.55.0/0.55.1.
<!-- SECTION:NOTES:END -->
