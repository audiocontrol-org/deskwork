---
id: TASK-122
title: >-
  Whole-feature composition stashes real scope in compositionExcludePaths; the
  AuditUnit it builds has diffScope.files=[] which the type contract reads as
  'whole diff'
status: To Do
assignee: []
created_date: '2026-06-14 20:52'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
021 phase-2 round-4 cross-model MEDIUM (AUDIT-BARRAGE-codex-02). govern.ts whole-feature path builds a feature AuditUnit with diffScope.files: [] and moves the true composed scope into compositionExcludePaths (out-of-band). But audit-unit-types.ts documents empty files == 'the whole diff against base', and a composed feature unit's diffScope should represent changed+cross-cutting paths. So AuditUnit no longer describes the payload the command audits — a future consumer reads a lie. Fix options: (a) extend the AuditUnit/diffScope contract to represent exclusion-based composition explicitly (an excludePaths field), or (b) keep the real composed scope in the unit instead of stashing it out-of-band. Currently harmless (feature mode doesn't consume diffScope.files) but a latent contract-drift trap.
<!-- SECTION:DESCRIPTION:END -->
