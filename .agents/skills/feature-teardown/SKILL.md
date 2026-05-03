---
name: feature-teardown
description: Remove local feature infrastructure by deleting the worktree and local branch after verifying it is safe to do so.
---

# Feature Teardown

1. Identify the feature.
2. Verify the worktree exists.
3. Check for uncommitted changes.
4. Remove the worktree.
5. Delete the local branch with `-d`, not `-D`.
6. Prune stale worktree references.
