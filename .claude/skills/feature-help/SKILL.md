---
name: feature-help
description: "Show the feature lifecycle workflow and report current state of active and in-progress features."
user_invocable: true
---

# Feature Help

Show the user the feature lifecycle and current state. Do NOT start any work.

## 1. Show the Feature Lifecycle

```
/feature-define    Interview to capture problem, scope, approach, tasks
        |          Output: /tmp/feature-definition-<slug>.md
        v
/feature-setup     Create branch, worktree, and docs from definition
        |          Output: feature/<slug> branch, worktree, populated docs
        v
/feature-issues    Create GitHub issues from workplan
        |          Output: parent + implementation issues, workplan updated
        v
/feature-implement Execute workplan tasks via sub-agents
        |
        v
/feature-review    Code review of recent changes
        |
        v
/feature-ship      Verify acceptance criteria, run tests, create PR
        |
        v
/feature-complete  Move docs to 003-COMPLETE, update ROADMAP, close issues
        |
        v
/feature-teardown  Remove worktree and branch
```

**Supporting skills:**
- `/session-start` — Bootstrap session
- `/session-end` — Write journal, update docs, commit
- `/feature-pickup` — Resume a feature
- `/feature-extend` — Add phases mid-implementation
- `/analyze-session` — Review session patterns

## 2. Show Current State

### Active worktree
- `basename $(pwd)` and `git rev-parse --abbrev-ref HEAD`

### In-progress features
- `ls docs/1.0/001-IN-PROGRESS/`
- For each: check worktree, definition file, GitHub issues

### Pending definitions
- `ls /tmp/feature-definition-*.md 2>/dev/null`

### Report format

| Feature | Worktree | Definition | Docs | Issues | Next Step |
|---------|----------|------------|------|--------|-----------|
