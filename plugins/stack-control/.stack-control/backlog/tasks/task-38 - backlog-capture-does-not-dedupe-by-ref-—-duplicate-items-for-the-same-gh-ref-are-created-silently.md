---
id: TASK-38
title: >-
  backlog capture does not dedupe by --ref — duplicate items for the same gh ref
  are created silently
status: Done
assignee: []
created_date: '2026-06-11 01:29'
updated_date: '2026-06-22 21:07'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - session-2026-06-11
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
capture applies no ref-dedupe (only import-github checks gh-<n> refs before creating). Observed 2026-06-11: the roadmap-migration pass captured 5 items (TASK-31/33/34/35/36) duplicating existing seed imports (TASK-21/19/20/18/17) with the same gh-436/434/435/432/430 refs; required a manual dedupe+archive pass plus ROADMAP pointer repointing. Suggested fix: capture (or a shared backend guard) warns or refuses when --ref matches an existing item's refs, mirroring import-github idempotence.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Resolved by 028 (backlog capture --ref dedupe via backend.exists); verified in src + backlog-capture-hardening.test.ts.
<!-- SECTION:NOTES:END -->
