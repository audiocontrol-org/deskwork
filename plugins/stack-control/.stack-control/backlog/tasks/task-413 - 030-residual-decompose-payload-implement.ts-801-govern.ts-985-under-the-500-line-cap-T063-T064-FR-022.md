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
Re-scoped 2026-06-22: payload-implement.ts DELETED by 030 US8; govern.ts is now 333 lines (under the 300-500 cap). FR-022 decompose/cap intent is met. Surviving work: the CLI dispatches to runEndGovern but the pipeline object output is not yet fully wired through (overlaps TASK-417 — WholeFeatureConvergenceRecord vs GovernConvergenceRecord shape mismatch). Scope: wire CLI pipeline output to runEndGovern cleanly so the record shape gate in capability-reconcile reads the correct type.
<!-- SECTION:DESCRIPTION:END -->
