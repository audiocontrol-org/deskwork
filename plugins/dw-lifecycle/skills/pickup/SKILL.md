---
name: dw-lifecycle:pickup
description: "Read workplan + check issue status + report next-action"
user_invocable: true
---

# /dw-lifecycle:pickup

Resume a feature mid-flight. Read the workplan, check GitHub issue status, report what's done and what's next.

## Steps

1. Confirm slug.
2. Read `<feature-dir>/workplan.md` and find the first unchecked task.
3. Read `<feature-dir>/README.md` for parent issue number; pull issue states via `gh issue view <n>`.
4. Read the latest journal entry referencing this slug.
5. Report:
   - Current phase + first unchecked task
   - Issue states (open/closed)
   - Last journal-entry summary
   - Suggested next command (typically `/dw-lifecycle:implement <slug>`)

## Error handling

- **Slug doesn't exist.** Suggest `/dw-lifecycle:doctor` to find orphan dirs or unbound features.
