---
id: TASK-456
title: >-
  session-end auto-derived commit/file counts over-attribute on a multi-session
  feature branch (merge-base boundary)
status: To Do
assignee: []
created_date: '2026-07-17 07:52'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - src/session/close.ts
ordinal: 455000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro: on a long-lived feature branch spanning several sessions (feature/fleet-control-plane), run stackctl session-end. It reported 'Commits: 20, Files changed: 43'. The true session was 10 commits / 17 files. Cause: the merge-base-with-base-branch boundary spans the WHOLE branch back to main, so it swept in three prior sessions' work already on the branch -- four design(fleet-control-plane) commits, 'chore: release v0.58.2', the PR #524 merge, and the audit-barrage-cc-timeout fixes. Impact: the journal's quantitative section is a trust surface (see the AUDIT-04 convention in .claude/CLAUDE.md -- re-derive counts, verify the arithmetic, false precision erodes trust). An agent that trusts the auto-derived number publishes an inflated session record. The verb's header does say 'auto-derived from git; verify before publishing' and that escape hatch worked here -- but it depends on the agent knowing the session's start SHA, which session-start does not record anywhere machine-readable. Workaround: pass --since <sha> explicitly if you know it. Suggested fixes in rough order of preference: (a) session-start records the boot HEAD to installation-local state; session-end defaults --since to it. (b) Fall back to commits-since-the-last-journal-entry rather than merge-base. (c) At minimum, have session-end NAME the boundary it used in its output (e.g. 'boundary: merge-base main (abc1234), 20 commits') so over-attribution is visible rather than silent -- cheap, and would have surfaced this immediately.
<!-- SECTION:DESCRIPTION:END -->
