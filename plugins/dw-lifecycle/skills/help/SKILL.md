---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

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
/dw-lifecycle:review    Three-track audit/review: verify, spec-review, code-review
/dw-lifecycle:audit     Synonym of review; same durable audit-log workflow
        |
        v
/dw-lifecycle:ship      Verify + open PR (stop at PR; operator merges)
        |
        v
/dw-lifecycle:complete  Move docs to complete-dir, close issues
        |
        v
/dw-lifecycle:teardown  Remove branch + worktree
/dw-lifecycle:customize Copy a built-in markdown template into .dw-lifecycle/templates/
```

2. Walk `docs/<version>/<inProgress>/*` and list active features with phase + last-touched dates.
3. List open dw-lifecycle-related GitHub issues across the repo.

## Error handling

- **No config.** Suggest `/dw-lifecycle:install` to bootstrap.
