---
name: feature-pickup
description: "Resume a feature: read workplan, check issue status, report current state and next steps."
user_invocable: true
---

# Feature Pickup

1. **Identify feature:**
   - Run: `basename $(pwd)` to get worktree name, extract feature slug
   - Run: `git rev-parse --abbrev-ref HEAD` to confirm branch
   - If on `main`, ask the user

2. **Read workplan:**
   - Read: `docs/1.0/001-IN-PROGRESS/<slug>/workplan.md`
   - Identify: current phase, completed tasks, next uncompleted task
   - Count: total tasks, completed tasks, percentage complete

3. **Check GitHub issues:**
   - Run: `gh issue list --state open` and filter for feature issues

4. **Read last session context:**
   - Read: `DEVELOPMENT-NOTES.md` (last entry only)

5. **Read feature README:**
   - Read: `docs/1.0/001-IN-PROGRESS/<slug>/README.md`

6. **Report to user:**
   - Feature, branch, progress, current phase, next task, open issues, last session summary
   - Proposed approach for this session

7. **Wait for confirmation** — do NOT start implementation.
