---
name: feature-complete
description: Mark a feature complete by moving its docs to `003-COMPLETE`, updating tracking docs, and closing related issues before merge.
---

# Feature Complete

1. Identify the feature from the worktree/branch. Refuse on `main`.
2. Verify an open PR exists for `feature/<slug>`.
3. Move `docs/1.0/001-IN-PROGRESS/<slug>` to `docs/1.0/003-COMPLETE/<slug>`.
4. Update the feature `README.md`.
5. Update any roadmap/tracking file if present.
6. Commit and push the doc move.
7. Close related GitHub issues with the PR reference.
