---
id: TASK-413
title: >-
  030 residual: decompose payload-implement.ts (801) + govern.ts (985) under the
  500-line cap (T063/T064, FR-022)
status: To Do
assignee: []
created_date: '2026-06-21 20:45'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - 'specs/030-chunked-end-govern/spec.md:FR-022'
ordinal: 413000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The CLI per-chunk loop (T036) reuses the existing barrage payload assembler (buildImplementVars -> payload-implement.ts, 801 lines) rather than switching the CLI to the end-govern-pipeline module (which would need the barrage->findings auditChunk integration). So payload-implement.ts remains (FR-022 decompose not done) and govern.ts is 985 lines (down from 1284 but still over cap; pre-existing TASK-151). All NEW 030 modules are <=500 (SC-007 for new code holds). Either decompose payload-implement in place, or do the deeper CLI switch to runEndGovern (enabling its removal + using seam/fix-fanout/bounded-loop at the CLI).
<!-- SECTION:DESCRIPTION:END -->
