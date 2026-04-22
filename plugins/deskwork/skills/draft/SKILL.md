---
name: draft
description: Move an Outlining entry to Drafting. The blog file already exists (scaffolded at outline time) — draft is where the body gets written. Optionally records a linked GitHub issue number.
---

## Draft

Advance an Outlining entry to Drafting. The blog post markdown was created at outline time with an empty body placeholder; this step is where the agent (or operator) writes the body.

### Input

The user provides the slug of an Outlining entry. Examples:

- `/deskwork:draft scsi-protocol-deep-dive`
- `/deskwork:draft --site editorialcontrol agent-as-workflow`

### Prerequisite

The entry must be in **Outlining**, with the blog file already scaffolded (for blog entries). If the outline step wasn't run, stop and point the user at `/deskwork:outline <slug>` first.

### GitHub issue (optional)

GitHub issue creation is outside the helper's scope. If the operator wants a tracking issue:

1. Use `gh issue create` to open one. Suggested shape:
   - Title: `[<contentType>] <entry title>`
   - Body: Description, target keywords, acceptance criteria (draft, review, publish)
2. Capture the number and pass `--issue <n>` so the calendar records it.

Ask first — do not open issues unless the user confirms.

### Steps

1. Resolve `--site` (or default).
2. Read the calendar; confirm the entry is in Outlining.
3. For blog entries: load the site's voice skill (if one exists in the host project) before writing any body copy. The outline set the shape; the voice skill tells you which register actually fits the site.
4. Optionally create a GitHub issue and capture its number.
5. Invoke the helper to flip the stage:

```
deskwork-draft.ts <project-root> [--site <slug>] [--issue <n>] <slug>
```

6. For blog entries: use the Edit tool to replace the `<!-- Write your post here -->` placeholder in the scaffolded file with body copy grounded in the outline and voice skill.
7. Report: slug, new stage (Drafting), issue number (if recorded). Suggest `/deskwork:publish <slug>` once the body is complete.

### Error handling

- **Entry not in Outlining** — helper refuses. If the stage is Planned, direct the user to `/deskwork:outline` first. Don't try to bypass the outline step.
- **Voice skill not present** — proceed without it if the project genuinely lacks one; don't fabricate voice guidance.
