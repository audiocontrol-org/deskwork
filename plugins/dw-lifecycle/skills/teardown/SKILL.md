---
name: dw-lifecycle:teardown
description: "Remove branch + worktree (infrastructure-only)"
user_invocable: true
---

# /dw-lifecycle:teardown

Remove the feature's branch + worktree. Pure infrastructure cleanup — no opinion on whether the feature is complete.

## Steps

1. Confirm slug.
2. Confirm with operator: "This will delete the branch `feature/<slug>` and remove the worktree at `<path>`. Continue?" (Destructive action; explicit confirmation required.)
3. Invoke `superpowers:using-git-worktrees`'s teardown helpers:

```
git worktree remove <worktree-path>
git branch -D feature/<slug>
```

4. Report: removed branch + worktree path. Suggest `/dw-lifecycle:complete` was already run if docs should have been moved (this skill does NOT move docs).

## Error handling

- **Worktree has uncommitted changes.** Surface; refuse to remove. Operator pushes/discards before re-running.
- **Operator declines confirmation.** Stop, no changes.
