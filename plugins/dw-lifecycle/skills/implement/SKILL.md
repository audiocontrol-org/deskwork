---
name: dw-lifecycle:implement
description: "Walk workplan tasks; delegate to subagents; commit at task boundaries"
user_invocable: true
---

# /dw-lifecycle:implement

Drive implementation through the workplan. Selects the next unchecked task, dispatches subagents per task, reviews output, marks the task done, commits. Repeats.

## Steps

1. Confirm slug and target version.
2. Invoke `superpowers:subagent-driven-development` as the orchestration discipline. The skill walks the workplan, dispatching per-task subagents with full task context.
3. For features touching existing code, dispatch `code-explorer` (from `feature-dev`) once at start to orient the agent. Skip if feature-dev not installed.
4. For each task in the workplan:
   - If the task involves architecture decisions, dispatch `code-architect` (from `feature-dev`) to propose 2–3 approaches before coding. Skip if feature-dev not installed.
   - If the task introduces or modifies tested code, follow `superpowers:test-driven-development` (write failing test → minimal impl → pass → commit).
   - If a step is independent of others, consider `superpowers:dispatching-parallel-agents` to fan out.
   - When the task body is complete, mark its checkboxes and commit.
5. After each task, optionally run `/dw-lifecycle:review` (does NOT block; operator chooses cadence).
6. Repeat until all tasks done or operator pauses.

## Error handling

- **feature-dev not installed.** Print one-line warning at start; agent dispatch steps are skipped. Skill continues with single-agent fallback.
- **Bug surfaces during a task.** Invoke `superpowers:systematic-debugging` before continuing the task. Don't push through with a known bug.
- **Test failures during TDD.** Per the TDD discipline: failing test is expected before implementation. Failing tests AFTER implementation means the impl is wrong; iterate, don't bypass the test.
