---
name: review-help
description: List every open (non-terminal) review workflow. Useful at session start to see what's in flight across the editorial pipeline.
---

## Review Help

List every non-terminal review workflow across the project.

### Input

```
/deskwork:review-help
/deskwork:review-help --site <slug>
```

### Steps

1. Resolve `--site` filter if provided.
2. Invoke the helper:

```
deskwork-review-help.ts <project-root> [--site <slug>]
```

3. Report to the operator in a human-readable table:
   - Slug, content kind, state, version, last update time
   - Group by state so open / in-review / iterating / approved are easy to scan
   - For `iterating` workflows, note that the agent owes a new version via `/deskwork:iterate`
   - For `approved` workflows, note they're ready to `/deskwork:approve`
