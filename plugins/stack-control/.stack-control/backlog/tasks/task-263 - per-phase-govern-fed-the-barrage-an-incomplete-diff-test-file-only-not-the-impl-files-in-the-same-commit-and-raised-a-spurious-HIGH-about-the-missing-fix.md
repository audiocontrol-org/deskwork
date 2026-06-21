---
id: TASK-263
title: >-
  per-phase govern fed the barrage an incomplete diff (test file only, not the
  impl files in the same commit) and raised a spurious HIGH about the missing
  fix
status: Done
assignee: []
created_date: '2026-06-19 00:16'
updated_date: '2026-06-21 01:26'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 263000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
027 Phase 2 re-govern: commit 28dc1566 changed roadmap.ts + roadmap-command.ts + the test, but the per-phase --phase 2 payload contained ONLY tests/cli/parser-adapter.test.ts. A barrage model (claude) flagged HIGH 'the diff omits the two files that ARE the fix' — a spurious HIGH caused by the harness input, not a code defect (the model verified the fix is correct by reading the files directly). Root: per-phase diff scoping (default --diff-base HEAD~1) fed only part of the phase's changed files. Same class as TASK-58/TASK-70/TASK-245. Workaround: re-govern with --diff-base set to the pre-phase commit so the full phase impl is audited. Fix: per-phase govern should audit the union of the phase's changed files across all its commits, not the HEAD~1 delta.
<!-- SECTION:DESCRIPTION:END -->
