---
id: TASK-426
title: >-
  AUDIT-20260622-07 — Seam pass misses multi-line exported function signatures
  (govern-at-end seam backstop)
status: Done
assignee: []
created_date: '2026-06-22 09:02'
updated_date: '2026-06-23 06:09'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - specs/030-chunked-end-govern/audit-log.md
ordinal: 426000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
parseExports/FN_HEAD in src/govern/seam-pass.ts:113-130 only match single-line export signatures; multi-line signatures skip required-arity changes. From 030 whole-feature govern (codex). Fix: parse export signatures across contiguous diff lines or use a TS-aware parser.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: verified in formally-installed release v0.53.2 (PR #497); fix present in installed cache + clean boot
<!-- SECTION:NOTES:END -->
