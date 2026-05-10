---
name: session-start
description: "Bootstrap a session by reading the feature workplan, latest journal entry, and open issues. Reports context so the user can confirm the session goal."
user_invocable: true
---

# Session Start

Read the following and report a concise summary to the user:

1. **Read the architectural thesis FIRST.**
   - Read: `THESIS.md` (top-level)
   - This is the project's load-bearing architectural contract: agent-as-primary-tool, skills do the work, operator extends via their agent. Re-read it every session before touching code — the project's history shows what happens when sessions skip it. The thesis is the *why*; everything below is the *how*.

2. **Read the state machine spec.**
   - Read: `DESKWORK-STATE-MACHINE.md` (top-level)
   - This is the canonical state-machine spec. Pre-redesign vocabulary (`reviewState`, "in review", "iterating", "approved") is RETIRED. The state machine is the eight stages; verbs (iterate / approve / cancel) are universal. Code, mockups, and prose that contradict the spec are violations and must be brought into compliance.

3. **Read the design standards.**
   - Read: `DESIGN-STANDARDS.md` (top-level)
   - This is the canonical record of `@deskwork/studio` design decisions — vocabulary, desktop vs mobile deltas, retired patterns, parked questions. **Read every session before any UI design or implementation work.** Settled decisions in there override fresh ideas in conversation; mockups must comply or explicitly propose amending the spec. The companion rule lives at `.claude/rules/design-standards.md`. The proposal archive at `docs/studio-design/{ACCEPTED,REJECTED}/` records the durable history of design decisions — scan REJECTED before proposing a direction to confirm it hasn't already been ruled out.

4. **Identify the feature** from the worktree name and branch:
   - Run: `basename $(pwd)` and `git rev-parse --abbrev-ref HEAD`
   - The worktree directory name IS the feature slug (no prefix to strip)

5. **Read the feature workplan**:
   - Read: `docs/1.0/001-IN-PROGRESS/<feature-slug>/README.md`
   - Read: `docs/1.0/001-IN-PROGRESS/<feature-slug>/workplan.md`
   - Note: current phase, completed tasks, next tasks

6. **Read the latest DEVELOPMENT-NOTES.md entry**:
   - Read: `DEVELOPMENT-NOTES.md` (last entry only)
   - Note: what was accomplished, what failed, course corrections

7. **Skim the dev workflow doc**:
   - Read: `DEVELOPMENT.md` (top-level)
   - This is the inner-loop reference: `npm run dev`, `node_modules/.bin/deskwork`, watch builds, studio dev mode, when to invoke which path. Re-read it instead of reasoning about how to fix-and-test from scratch — the patterns are documented to avoid relitigating them every session.

8. **Check open GitHub issues**:
   - Run: `gh issue list --state open`

9. **Plan sub-agent delegation for the proposed goal:**
   - Consult the **Sub-Agent Delegation** table in `.claude/CLAUDE.md` and map each chunk of work to its specialist (e.g. TypeScript implementation → `typescript-pro`; SKILL.md prose → `documentation-engineer`; multi-chunk implementation with PR delivery → `feature-orchestrator`).
   - Default to delegating: per the project's "Before Committing" checklist, *"Could this task have been delegated to a sub-agent?"* is the leading question. The default answer is yes. The `[PROCESS] didn't delegate` correction in `.claude/rules/session-analytics.md` exists because in-thread implementation is a recurring failure mode.
   - When in doubt — multi-chunk feature work, anything that crosses package boundaries, anything matching a row in the delegation table — pick `feature-orchestrator` and let it dispatch the specialists.
   - Keep work in-thread only for trivial single-file edits, doc-only changes, or skill/workplan updates where delegation overhead exceeds the task itself.

10. **Report to the user**:
    - Feature name and current phase
    - Last session's key accomplishments and failures
    - Top unresolved issues
    - Proposed goal for this session **including which sub-agents will own which chunks** (or an explicit note that the work is small enough to keep in-thread)
    - If the proposed goal involves studio UI: cite the relevant section(s) of `DESIGN-STANDARDS.md` so it's clear which decisions are settled vs in-play. Also scan `docs/studio-design/REJECTED/` for prior rejections of any direction being considered.

Do NOT start coding until the user confirms the session goal.
