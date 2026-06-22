---
id: TASK-125
title: >-
  Whole-feature govern ignores --checkpoint/GOVERN_CHECKPOINT (always labels
  after_implement)
status: Done
assignee: []
created_date: '2026-06-15 00:38'
updated_date: '2026-06-22 16:11'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
021 phase-4 audit, codex-gpt5 MEDIUM. The whole-feature implement path hardcodes the AuditUnit auditLogSection to 'after_implement' (both before and after the composition refactor), so a --checkpoint / GOVERN_CHECKPOINT override is silently ignored for whole-feature runs. Pre-existing (not a regression). Decide whether whole-feature should honor an explicit checkpoint label or fail loud if one is supplied; minor.
<!-- SECTION:DESCRIPTION:END -->
