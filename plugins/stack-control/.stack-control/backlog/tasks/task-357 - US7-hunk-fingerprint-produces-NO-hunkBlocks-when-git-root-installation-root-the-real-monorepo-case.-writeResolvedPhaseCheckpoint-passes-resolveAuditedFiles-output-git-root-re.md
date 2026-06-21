---
id: TASK-357
title: >-
  US7 hunk-fingerprint produces NO hunkBlocks when git-root != installation-root
  (the real monorepo case). writeResolvedPhaseCheckpoint passes
  resolveAuditedFiles output (git-root-relative, e.g.
  plugins/stack-control/src/...) to computePhaseHunkBlocks, which runs git diff
  with cwd=installationRoot and needs installation-relative paths -> empty diff
  -> [] hunks -> whole-file fallback always. US7's content-presence freshness
  never engages in-monorepo; the hunk-fingerprint test passed only because its
  fixture had git-root==installation-root. Fix: pass installation-relative files
  (strip the git --show-prefix) to computePhaseHunkBlocks.
status: Done
assignee: []
created_date: '2026-06-20 14:55'
updated_date: '2026-06-21 01:42'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 357000
---


