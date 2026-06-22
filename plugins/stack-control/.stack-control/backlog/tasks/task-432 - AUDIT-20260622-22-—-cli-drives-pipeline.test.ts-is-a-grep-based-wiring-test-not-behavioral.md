---
id: TASK-432
title: >-
  AUDIT-20260622-22 — cli-drives-pipeline.test.ts is a grep-based wiring test,
  not behavioral
status: To Do
assignee: []
created_date: '2026-06-22 11:07'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-22
ordinal: 432000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/__tests__/govern/cli-drives-pipeline.test.ts:36-46 concatenates source and regex-matches runEndGovern(/writeWholeFeatureConvergenceRecord(. An import/helper/dead-branch satisfies the regex without proving the implement CLI path writes the record after the pipeline. Make it behavioral: run govern --mode implement against a fixture, assert exactly one whole-feature record written + barrage reached via runEndGovern. From 030 round-2 govern (codex).
<!-- SECTION:DESCRIPTION:END -->
