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
4. Compose journal entry following the canonical format:

```markdown
## YYYY-MM-DD: [Session Title]
### Feature: [slug]
### Worktree: [name]

**Goal:** ...
**Accomplished:** ...
**Didn't Work:** ...
**Course Corrections:** ...
**Quantitative:** ...
**Insights:** ...
```

5. Append the entry via the helper:

```
dw-lifecycle journal-append --file <entry.md>
```

6. Read `config.session.end.preamble` and display any project-specific wrap-up text.
7. Commit all documentation changes:

```
git add <feature-dir> DEVELOPMENT-NOTES.md
git commit -m "docs: session-end <YYYY-MM-DD> [<slug>]"
```

8. Report: commit hash, files changed, journal-entry summary.

## Error handling

- **Uncommitted code changes outside docs.** Skill warns: "There are non-doc changes uncommitted. Commit those separately first to keep the session-end commit doc-only."
