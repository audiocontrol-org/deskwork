---
id: TASK-433
title: >-
  AUDIT-20260622-24 — GOVERN_CHECKPOINT/--checkpoint contradiction across
  contract/FR-029/quickstart
status: Done
assignee: []
created_date: '2026-06-22 13:59'
updated_date: '2026-06-23 06:09'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md#AUDIT-20260622-24
ordinal: 433000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
contracts/govern-cli.md says --checkpoint/GOVERN_CHECKPOINT removed globally; spec FR-029 says spec mode retains it; quickstart Scenario 4 grep expects zero hits. Cross-model (claude+codex). Reconcile the three docs. From 030 round-3 govern.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: verified in formally-installed release v0.53.2 (PR #497); fix present in installed cache + clean boot
<!-- SECTION:NOTES:END -->
