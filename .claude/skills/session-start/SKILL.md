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

4. **Skim the dev workflow doc**:
   - Read: `DEVELOPMENT.md` (top-level)
   - This is the inner-loop reference: `npm run dev`, `node_modules/.bin/deskwork`, watch builds, studio dev mode, when to invoke which path. Re-read it instead of reasoning about how to fix-and-test from scratch — the patterns are documented to avoid relitigating them every session.

5. **Check open GitHub issues**:
   - Run: `gh issue list --state open`

6. **Plan sub-agent delegation for the proposed goal:**
   - Consult the **Sub-Agent Delegation** table in `.claude/CLAUDE.md` and map each chunk of work to its specialist (e.g. TypeScript implementation → `typescript-pro`; SKILL.md prose → `documentation-engineer`; multi-chunk implementation with PR delivery → `feature-orchestrator`).
   - Default to delegating: per the project's "Before Committing" checklist, *"Could this task have been delegated to a sub-agent?"* is the leading question. The default answer is yes. The `[PROCESS] didn't delegate` correction in `.claude/rules/session-analytics.md` exists because in-thread implementation is a recurring failure mode.
   - When in doubt — multi-chunk feature work, anything that crosses package boundaries, anything matching a row in the delegation table — pick `feature-orchestrator` and let it dispatch the specialists.
   - Keep work in-thread only for trivial single-file edits, doc-only changes, or skill/workplan updates where delegation overhead exceeds the task itself.

7. **Report to the user**:
   - Feature name and current phase
   - Last session's key accomplishments and failures
   - Top unresolved issues
   - Proposed goal for this session **including which sub-agents will own which chunks** (or an explicit note that the work is small enough to keep in-thread)

Do NOT start coding until the user confirms the session goal.
