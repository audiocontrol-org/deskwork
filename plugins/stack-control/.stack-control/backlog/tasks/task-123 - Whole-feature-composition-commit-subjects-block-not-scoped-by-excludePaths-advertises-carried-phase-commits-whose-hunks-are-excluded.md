---
id: TASK-123
title: >-
  Whole-feature composition: commit-subjects block not scoped by excludePaths
  (advertises carried-phase commits whose hunks are excluded)
status: Done
assignee: []
created_date: '2026-06-15 00:32'
updated_date: '2026-06-22 16:11'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
021 phase-3 audit, codex-gpt5 MEDIUM. assembleImplementPayload builds commitSubjects with 'git log base..HEAD --oneline -- .', NOT applying the excludePaths/composition scope. So the exclusion-based whole-feature payload's 'Under audit' diff excludes carried phases, but the 'Commit subjects in the audited range' block can still list commits that only touched carried (excluded) files — internally inconsistent prompt for the fleet. Fix: scope commit-subject collection with the same exclude pathspec as the committed-diff arm, or drop subjects with no surviving hunks in the composed payload. payload-implement.ts:420-427.
<!-- SECTION:DESCRIPTION:END -->
