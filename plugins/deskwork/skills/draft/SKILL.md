---
name: draft
description: Move a Planned entry to Drafting. For blog entries, scaffolds a blog post directory with YAML frontmatter. For youtube and tool entries, no file is created (content lives outside the repo). Optionally creates and records a GitHub issue.
---

## Draft

Start drafting a Planned entry. For blog entries, this scaffolds the blog post directory and `index.md` with the site's configured layout and the author from the deskwork config. For `youtube` and `tool` entries, no file is created — the content lives outside the repo.

### Input

The user provides the slug of a Planned entry. Examples:

- `/deskwork:draft scsi-protocol-deep-dive`
- `/deskwork:draft --site editorialcontrol agent-as-workflow`

### GitHub issue (optional)

GitHub issue creation is **not** handled by the helper. After scaffolding:

1. Use `gh issue create` to file a tracking issue. Suggested shape:
   - Title: `[<contentType>] <entry title>`
   - Body: Description, target keywords, acceptance criteria (draft, review, publish)
2. Capture the issue number from the `gh` output.
3. Pass `--issue <n>` to the helper so the calendar entry records the linked issue.

Ask the user whether to open an issue. If they say yes, do so before invoking the helper (so the number is available). If they say no, invoke the helper without `--issue`.

### Steps

1. Resolve `--site` (or default).
2. Read the calendar to confirm the slug is in Planned. (Optional — the helper also checks.)
3. Optionally create a GitHub issue with `gh issue create` and capture its number.
4. Invoke the helper:

```
deskwork-draft.ts <project-root> [--site <slug>] [--issue <n>] [--author "Name"] <slug>
```

For blog entries, the helper creates the directory and `index.md` with filled-in frontmatter. For `youtube`/`tool`, it only flips the stage and optionally records the issue number.

5. Report what was created:
   - For blog: path to the `index.md` and the issue number (if any). Suggest the user begin writing.
   - For non-blog: the issue number (if any) and a reminder that `/deskwork:publish` will require `contentUrl` to be set before advancing.

### Author

The helper pulls the author from `config.author`. Pass `--author "Name"` to override for a single invocation (useful for guest posts). If neither is set, the helper errors with guidance.

### Error handling

- **blogLayout not configured** — the helper tells the user to add `blogLayout` to the site config. Do not try to scaffold without it.
- **File already exists** — surface the helper's error. The existing file is not overwritten.
- **Entry not in Planned** — surface the error with current stage. Do NOT try to move forward anyway.
