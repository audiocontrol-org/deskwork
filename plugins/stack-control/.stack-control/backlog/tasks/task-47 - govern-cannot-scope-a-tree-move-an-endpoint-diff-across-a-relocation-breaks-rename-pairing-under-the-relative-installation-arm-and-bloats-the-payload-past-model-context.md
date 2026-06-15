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
- **Partially addressed by 021 T026 (NOT fully resolved — stays open):** the committed + cross-tree diff arms now force `git diff --find-renames`, so an IN-SCOPE tree-move pairs as a rename (small payload) independent of the operator's `diff.renames` config — covered by `govern-rename-scope.test.ts`. The ORIGINAL repro here is harder: a relocation whose delete side lies OUTSIDE the `--relative` installation arm cannot be paired by `--find-renames` (git sees only the add endpoint within the scope). That residual — rename-pair across the installation boundary, or a payload-size FATAL with actionable advice — is still open.
<!-- SECTION:NOTES:END -->
