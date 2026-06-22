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
Re-scoped 2026-06-22: 021 T026 added --find-renames for the committed/cross-tree arms (partial fix landed). Surviving residual: a rename across the installation boundary (git mv moving files in OR out of the installation subtree) still bloats the payload — the delete side is outside the relative subtree, so git diff --relative shows a full ADD. No rename-pairing across the boundary, and no payload-size FATAL with actionable advice. Candidate next step: detect cross-boundary bloat (payload > threshold) and emit a FATAL with actionable advice (e.g. use a synthetic base commit or --diff-base recipe), rather than silently shipping the oversized payload.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/021-audit-protocol-friction-burndown
- **Partially addressed by 021 T026 (NOT fully resolved — stays open):** the committed + cross-tree diff arms now force `git diff --find-renames`, so an IN-SCOPE tree-move pairs as a rename (small payload) independent of the operator's `diff.renames` config — covered by `govern-rename-scope.test.ts`. The ORIGINAL repro here is harder: a relocation whose delete side lies OUTSIDE the `--relative` installation arm cannot be paired by `--find-renames` (git sees only the add endpoint within the scope). That residual — rename-pair across the installation boundary, or a payload-size FATAL with actionable advice — is still open.
<!-- SECTION:NOTES:END -->
