---
name: session-start
description: "Bootstrap session: read workplan + journal + open issues; report context"
---

# /dw-lifecycle:session-start

Bootstrap a session. Reads the active feature's workplan, last journal entry, and open issues; reports context.

## Steps

1. Identify the active feature from worktree name + branch.
2. Read `config.session.start.preamble` from `.dw-lifecycle/config.json` (project-specific bootstrap text — e.g., "check the Grafana dashboard before coding"). Display it.
3. Read the feature's `README.md` (status table, current phase) and `workplan.md` (next unchecked task).
4. Read the latest entry from `DEVELOPMENT-NOTES.md` referencing this slug.
5. Run `gh issue list --state open --search <slug>` to surface relevant issues.
6. Report context to the operator. Do NOT start work until they confirm the session goal.

## Error handling

- **Not on a feature branch.** Skill prompts: "Current branch is `main` (or other non-feature branch). Switch to a feature worktree before continuing."
