---
name: define
description: "Interview to capture problem/scope/approach/tasks; writes feature-definition.md"
---

# /dw-lifecycle:define

Capture a new feature's problem, scope, approach, and task breakdown. Hands off to `superpowers:brainstorming` for the interview itself; this skill wraps brainstorming's output with the project-management envelope.

## Steps

1. Confirm the feature slug (kebab-case; the operator picks).
2. Invoke `superpowers:brainstorming` to drive the design conversation. The brainstorming skill produces a design doc; we'll capture its key fields into `feature-definition.md`.
3. (Optional) For features that touch existing code, dispatch the `code-explorer` agent (from `feature-dev`) before the interview to surface relevant patterns/files. Skip if `feature-dev` is not installed (warning printed at skill start; install via `/plugin install feature-dev@claude-plugins-official`).
4. Write `/tmp/feature-definition-<slug>.md` from the brainstorming output. Required sections:
   - Problem (1–2 paragraphs)
   - Scope (in/out)
   - Approach (chosen design summary)
   - Tasks (high-level phase list)
5. Report: definition file path. Suggest `/dw-lifecycle:setup <slug> --target <version> --definition <path>` next.

## Error handling

- **Brainstorming not finished.** This skill does NOT bypass brainstorming. If the operator wants to skip, they should write the definition file by hand and call `/dw-lifecycle:setup` directly.
- **feature-dev not installed.** Warning at start; the `code-explorer` step is skipped. Skill continues.
