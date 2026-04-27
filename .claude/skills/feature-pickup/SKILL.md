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

6. **Plan sub-agent delegation for the proposed approach:**
   - Consult the **Sub-Agent Delegation** table in `.claude/CLAUDE.md` and map each chunk of work to its specialist (e.g. TypeScript implementation → `typescript-pro`; SKILL.md prose → `documentation-engineer`; multi-chunk implementation with PR delivery → `feature-orchestrator`).
   - Default to delegating: per the project's "Before Committing" checklist, *"Could this task have been delegated to a sub-agent?"* is the leading question. The default answer is yes. The `[PROCESS] didn't delegate` correction in `.claude/rules/session-analytics.md` exists because in-thread implementation is a recurring failure mode.
   - When in doubt — multi-chunk feature work, anything that crosses package boundaries, anything matching a row in the delegation table — pick `feature-orchestrator` and let it dispatch the specialists.
   - Keep work in-thread only for trivial single-file edits, doc-only changes, or skill/workplan updates where delegation overhead exceeds the task itself.

7. **Report to user:**
   - Feature, branch, progress, current phase, next task, open issues, last session summary
   - Proposed approach **including which sub-agents will own which chunks** (or an explicit note that the work is small enough to keep in-thread)

8. **Wait for confirmation** — do NOT start implementation.
