---
id: TASK-39
title: >-
  session-end auto-derivation reported 0 commits / no backlog touched for a
  10-commit session
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
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stackctl session-end (installed v0.42.0, run at plugins/stack-control) emitted a journal entry whose quantitative section read 'Commits: 0 (no commits this session)' and 'Backlog touched: (none)' despite 10 session commits referencing TASK ids (window c437231e..58663921 on feature/stack-control). The boundary derivation (merge-base with base branch -> HEAD~N fallback) missed the window entirely; 'backlog progressed (0)' in the verb output is the same symptom. Numbers were re-derived by hand per the verify-before-publishing instruction. Repro: run session-end on a long-lived feature branch many commits past the main merge-base.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed 2026-06-22 (commit 63d7ffda): sessionBoundary anchors the journal window at the last journal-touching commit (robust to a pushed-up upstream); RED-first test reproduces the collapse.
<!-- SECTION:NOTES:END -->
