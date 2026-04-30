---
name: help
description: "Render lifecycle diagram + current state of active features"
---

# /dw-lifecycle:help

Show the lifecycle diagram and current state. Read-only; does not start any work.

## Steps

1. Render the lifecycle diagram:

```
/dw-lifecycle:install   Bootstrap config in host project
        |
        v
/dw-lifecycle:define    Interview to capture problem/scope/approach/tasks
        |
        v
/dw-lifecycle:setup     Create branch, worktree, version-aware docs
        |
        v
/dw-lifecycle:issues    Create GitHub parent + phase issues
        |
        v
/dw-lifecycle:implement Walk workplan tasks via subagents
        |
        v
/dw-lifecycle:review    Delegate code review (feature-dev's reviewer)
        |
        v
/dw-lifecycle:ship      Verify + open PR (stop at PR; operator merges)
        |
        v
/dw-lifecycle:complete  Move docs to complete-dir, close issues
        |
        v
/dw-lifecycle:teardown  Remove branch + worktree
```

2. Walk `docs/<version>/<inProgress>/*` and list active features with phase + last-touched dates.
3. List open dw-lifecycle-related GitHub issues across the repo.

## Error handling

- **No config.** Suggest `/dw-lifecycle:install` to bootstrap.
