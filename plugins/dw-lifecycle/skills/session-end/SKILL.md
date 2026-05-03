---
name: session-end
description: "Append journal entry; update feature docs; commit documentation changes"
---

# /dw-lifecycle:session-end

Wrap up a session. Append a structured journal entry, update feature docs, commit documentation changes.

## Steps

1. Identify active feature.
2. Update `<feature-dir>/README.md` status table (check off completed acceptance criteria, update phase status).
3. Update `<feature-dir>/workplan.md` (check off completed task steps).
4. Determine the journal-entry template path:
   - use `.dw-lifecycle/templates/journal-entry.md` if the project customized it
   - otherwise use the bundled default copied by `/dw-lifecycle:customize templates journal-entry`
5. Compose the journal entry from that template. The bundled default is intentionally generic:

```markdown
## YYYY-MM-DD: [Session Title]
### Feature: [slug]
### Worktree: [name]

**Goal:** ...
**Accomplished:** ...

[Add, remove, or rename sections to match this project's journaling style.]
```

6. Append the entry via the helper:

```
dw-lifecycle journal-append --file <entry.md>
```

7. Read `config.session.end.preamble` and display any project-specific wrap-up text.
8. Commit all documentation changes:

```
git add <feature-dir> DEVELOPMENT-NOTES.md
git commit -m "docs: session-end <YYYY-MM-DD> [<slug>]"
```

9. Report: commit hash, files changed, journal-entry summary.

## Error handling

- **Uncommitted code changes outside docs.** Skill warns: "There are non-doc changes uncommitted. Commit those separately first to keep the session-end commit doc-only."
