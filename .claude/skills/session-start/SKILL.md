---
name: session-start
description: "Bootstrap a session by reading the feature workplan, latest journal entry, and open issues. Reports context so the user can confirm the session goal."
user_invocable: true
---

# Session Start

Read the following and report a concise summary to the user:

1. **Identify the feature** from the worktree name and branch:
   - Run: `basename $(pwd)` and `git rev-parse --abbrev-ref HEAD`
   - The worktree directory name IS the feature slug (no prefix to strip)

2. **Read the feature workplan**:
   - Read: `docs/1.0/001-IN-PROGRESS/<feature-slug>/README.md`
   - Read: `docs/1.0/001-IN-PROGRESS/<feature-slug>/workplan.md`
   - Note: current phase, completed tasks, next tasks

3. **Read the latest DEVELOPMENT-NOTES.md entry**:
   - Read: `DEVELOPMENT-NOTES.md` (last entry only)
   - Note: what was accomplished, what failed, course corrections

4. **Check open GitHub issues**:
   - Run: `gh issue list --state open`

5. **Report to the user**:
   - Feature name and current phase
   - Last session's key accomplishments and failures
   - Top unresolved issues
   - Proposed goal for this session

Do NOT start coding until the user confirms the session goal.
