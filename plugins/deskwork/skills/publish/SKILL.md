---
name: publish
description: Final → Published — the only graduation event from Final; freezes the artifact
---

## Publish

Promote a Final-stage entry to Published. Operator runs this when the artifact is ready for external publication. Published is frozen.

### Prerequisite

Entry must be at currentStage="Final". The operator's `/deskwork:publish <slug>` invocation IS the publish event — per THESIS Consequence 2, the studio's Publish button is a clipboard-copy of this slash command and does NOT mutate sidecar state.

### Input

```
/deskwork:publish <slug>
/deskwork:publish <slug> --date <YYYY-MM-DD>   # explicit publish date; default: today
```

### Steps

1. Resolve `<slug>` → uuid.
2. Read sidecar.
3. Validate: currentStage === "Final".
4. Determine datePublished: from `--date` flag, or today (UTC).
5. Read the artifact at `<contentDir>/<slug>/index.md`.
6. Use Edit tool to update the artifact's frontmatter, adding `datePublished: <YYYY-MM-DD>`. Preserve all other frontmatter fields.
7. Update the sidecar:
   - currentStage: "Published"
   - reviewState: undefined
   - datePublished: <ISO 8601 with timezone>
   - updatedAt: <now>
8. Append journal event: { kind: "stage-transition", from: "Final", to: "Published", metadata: { datePublished: <ISO 8601> } }.
9. Run `deskwork doctor` to validate.

### Error handling

- **Not at Final.** Refuse: "publish only works from Final stage; entry is at <currentStage>."
- **datePublished already set on the artifact.** Refuse: "artifact has datePublished=<existing>; choose a new approve+publish path or manual edit."
