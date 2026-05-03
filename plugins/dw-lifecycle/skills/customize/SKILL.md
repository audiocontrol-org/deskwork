---
name: customize
description: "Copy a built-in dw-lifecycle markdown template into .dw-lifecycle/templates/ so the project can tailor it."
---

# /dw-lifecycle:customize

Create a project-local override for one of dw-lifecycle's built-in markdown templates.

## Steps

1. Confirm the category and template name. Today only one shape is supported:
   - `templates journal-entry`
2. Invoke the helper from the project root:

```bash
dw-lifecycle customize templates journal-entry
```

3. Edit the copied file at `.dw-lifecycle/templates/journal-entry.md`.
4. Re-run `/dw-lifecycle:session-start` or `/dw-lifecycle:session-end`; they should use the project override automatically.

## Error handling

- **Override already exists.** Refuse to overwrite it.
- **Unknown template name.** Surface the valid built-in names.
