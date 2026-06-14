---
id: TASK-47
title: >-
  govern cannot scope a tree-move: an endpoint diff across a relocation breaks
  rename pairing under the --relative installation arm and bloats the payload
  past model context
status: To Do
assignee: []
created_date: '2026-06-11 07:10'
updated_date: '2026-06-14 01:54'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found at the installation-isolation after_implement governance pass: the feature relocated specs/.specify into the installation (git mv, history-preserving); git diff --relative <pre-feature-base> then shows every moved file as a pure ADD (~1.8MB / 20k insertions of pre-existing spec text) because the delete side lies outside the installation subtree. govern has no end-ref or pathspec seam, and GOVERN_PAYLOAD_BUDGET bounds only the untracked fold. Workaround used: a local synthetic rename-neutralized base commit (worktree at the base + the same git mv, never pushed). Candidate fixes: rename-pair across the boundary before relativizing; a documented --diff-base recipe for relocations; or a payload-size FATAL with actionable advice instead of silent oversized shipping.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/021-audit-protocol-friction-burndown
<!-- SECTION:NOTES:END -->
