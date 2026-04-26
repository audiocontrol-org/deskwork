---
name: add
description: Add a new idea to the editorial calendar. Accepts a title, optional description, content type (blog/youtube/tool), and content URL. The idea lands in the Ideas stage — promote it later with /deskwork:plan.
---

## Add

Capture a new content idea in the editorial calendar.

### Input

The user provides a title and optionally a description. Examples:

- `/deskwork:add "SCSI Protocol Deep Dive"`
- `/deskwork:add --site editorialcontrol "Agents as Workflow Primitives"`
- `/deskwork:add "SCSI Protocol Deep Dive" "A technical walkthrough of the SCSI protocol for vintage hardware"`

If the project has multiple sites, confirm which one the idea belongs to. The `--site <slug>` flag is accepted; default is the project's `defaultSite`.

### Content type

Before writing, ask the user for the **content type** unless obvious from context. One of:

- `blog` (default) — lives in this repo under the site's configured `contentDir`
- `youtube` — video hosted on YouTube; ask for the video URL if already recorded
- `tool` — standalone tool or app on the site; ask for the canonical URL if already live

For `youtube` and `tool` entries, capture the URL now if the content is already published. If it's still planned, leave it unset — `/deskwork:publish` will require it before advancing.

### Steps

1. Resolve `--site` (or default) and confirm with the user when ambiguous.
2. Ask the user for content type if not obvious (default: `blog`).
3. For non-blog types with a known URL, capture it.
4. Invoke the helper:

```
deskwork add [--site <slug>] [--type blog|youtube|tool] \
                [--content-url URL] <title> [description]
```

The helper writes the calendar atomically and prints a JSON result with the generated slug.

5. Report the result: slug, site, stage, and content type. Suggest next step (`/deskwork:plan <slug>`).

### Error handling

- The helper refuses duplicate slugs and unknown `--type` values. Surface the error verbatim rather than papering over it.
- Do not re-run on failure without understanding why — duplicate slug means the idea is already tracked.
