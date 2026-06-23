---
id: TASK-109
title: AUDIT-20260614-81 — Checkpoint writes can leave torn temp files on failure
status: Done
assignee: []
created_date: '2026-06-14 18:32'
updated_date: '2026-06-23 06:09'
labels:
  - 'type:migrated-finding'
  - 'feature:audit-protocol-friction-burndown'
  - 'finding:AUDIT-20260614-81'
dependencies: []
references:
  - 'audit:audit-protocol-friction-burndown:AUDIT-20260614-81'
priority: medium
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-scoped 2026-06-22: original finding cited checkpoint-state.ts:58-63 writePhaseCheckpoint() (deleted by 030 US2 — moot). Surviving risk: writeWholeFeatureConvergenceRecord in chunk-artifacts.ts uses atomic temp+rename; a crash between write and rename leaves a torn temp file that can shadow the real convergence record on next run. Add a temp-file cleanup step (scan for .tmp.json siblings on govern startup) or use a write-then-rename pattern that avoids temp persistence. Compare with chunk-artifact.ts tear-on-failure path.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: verified in formally-installed release v0.53.2 (PR #497); fix present in installed cache + clean boot
<!-- SECTION:NOTES:END -->
