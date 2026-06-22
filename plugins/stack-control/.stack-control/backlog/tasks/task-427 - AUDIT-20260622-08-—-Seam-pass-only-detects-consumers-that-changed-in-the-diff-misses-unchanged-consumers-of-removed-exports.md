---
id: TASK-427
title: >-
  AUDIT-20260622-08 — Seam pass only detects consumers that changed in the diff
  (misses unchanged consumers of removed exports)
status: To Do
assignee: []
created_date: '2026-06-22 09:03'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-08
ordinal: 427000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/govern/seam-pass.ts:166-178,195-197: chunkText built from input.fileDiffs only; consumedInOtherChunk searches only diff text. A removed export breaking an UNCHANGED consumer in another chunk is suppressed (consumed=false), and end-govern-pipeline treats openFindings==0 && seamResult.findings==0 as converged -> can graduate a real cross-boundary break. Design fix: use coupling/import graph or current source content for other chunks, not only diff lines. From 030 whole-feature govern (codex). DESIGN-LEVEL.
<!-- SECTION:DESCRIPTION:END -->
