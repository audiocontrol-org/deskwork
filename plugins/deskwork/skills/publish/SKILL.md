---
name: publish
description: Mark a Drafting/Review entry as Published with today's date (or an explicit date). Verifies the blog file exists (blog entries) or that contentUrl is set (youtube/tool). Optionally closes the linked GitHub issue.
---

## Publish

Ship a drafted entry. Verifies the content is ready, advances the calendar entry to Published, and optionally closes the GitHub issue.

### Input

The user provides the slug to publish. Examples:

- `/deskwork:publish scsi-protocol-deep-dive`
- `/deskwork:publish --site editorialcontrol agent-as-workflow`
- `/deskwork:publish --date 2026-04-01 backdated-post`

### Preflight

Before invoking the helper, the skill should know:

- For `blog` entries: the post file at `<contentDir>/<slug>/index.md` must already exist (the helper also checks).
- For `youtube` / `tool` entries: the entry's `contentUrl` must be set. If it's missing, ask the user for the URL and pass it with `--content-url`.

### Steps

1. Resolve `--site` (or default).
2. Read the calendar to find the entry and check its content type + contentUrl state. If it's non-blog and `contentUrl` is unset, ask the user for the URL.
3. Invoke the helper:

```
deskwork publish [--site <slug>] [--date YYYY-MM-DD] \
                    [--content-url URL] <slug>
```

The helper:
- Verifies the blog file exists (blog entries)
- Sets `contentUrl` if `--content-url` is passed
- Requires `contentUrl` for non-blog entries
- Flips the entry to Published with the given date (defaults to today)

4. If the response includes an `issueNumber`, offer to close it:
   - For blog: `gh issue close <n> --comment "Published: /blog/<slug>/"`
   - For non-blog: `gh issue close <n> --comment "Published: <contentUrl>"`

   Ask the user first — closing the issue is visible and hard to undo.

5. Report: slug, site, publish date, content type, and (for youtube) a reminder to run `/deskwork:social-review` later.

### Error handling

- **Missing blog file** — the helper refuses. Surface the error and do NOT try to create an empty file to work around it.
- **Missing contentUrl for non-blog** — re-prompt the user for the URL, do not fabricate one.
- **Already Published** — the helper refuses re-publishing. If the user intended to update the date, they should edit the calendar by hand.
