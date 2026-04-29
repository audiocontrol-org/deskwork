---
name: distribute
description: Record the URL of a shortform post after the operator has posted it manually to the platform. Updates the calendar's distribution record so the dashboard matrix shows the cell as covered with the posted URL. Run after /deskwork:approve has finalized the shortform copy and after you've posted to the platform.
---

## Distribute

Close the loop on a shortform post by recording the URL of the share. Deskwork doesn't post for you — the operator pastes the approved copy into the platform's UI, posts, then runs this helper with the resulting URL. The calendar's `DistributionRecord` for the `(slug, platform, channel?)` tuple gets the URL and `dateShared` filled in; the dashboard matrix flips the cell to "covered".

### When to use

After `/deskwork:approve` has finalized the shortform copy AND the operator has manually posted to the platform and obtained the share URL. Running it before the post exists is fine if the URL is already known — the helper just writes whatever URL you give it.

### Input

```
/deskwork:distribute <slug> --platform <p> --url <posted-url>
/deskwork:distribute --site <s> <slug> --platform <p> --channel <c> --url <posted-url>
/deskwork:distribute <slug> --platform <p> --url <posted-url> --date 2026-04-27 --notes "Cross-post to r/foo"
```

### Required arguments

- `<slug>` — the calendar entry slug.
- `--platform` — one of `reddit`, `youtube`, `linkedin`, `instagram`.
- `--url` — the URL of the posted share (the Reddit thread, YouTube video, LinkedIn post, etc.).

### Optional arguments

- `--site <s>` — defaults to `config.defaultSite` (or the only site for single-site projects).
- `--channel <c>` — kebab-case sub-channel matching the shortform workflow (e.g. `rprogramming`). Required when the platform record is keyed by channel.
- `--date <YYYY-MM-DD>` — defaults to today (UTC). Only override when backfilling a previously posted share.
- `--notes <text>` — free-form context preserved on the distribution record.

### Steps

1. Resolve `--site` (or default).
2. Confirm the operator has the URL handy — without `--url`, the helper refuses.
3. Invoke the helper:

```
deskwork distribute [--site <slug>] --platform <p> [--channel <c>] --url <posted-url> [--date YYYY-MM-DD] [--notes <text>] <slug>
```

The helper:

- Resolves the calendar entry by slug (refuses if not found)
- Updates an existing `DistributionRecord` matching `(entryId | slug, platform, channel?)`, or creates a fresh one
- Writes the calendar back to disk

4. Report to the operator: slug, platform, channel (if any), the recorded URL, and `dateShared`. Suggest committing the calendar diff.

### Flow this fits into

```
/deskwork:shortform-start <slug> --platform <p>
   → operator opens the studio review URL, edits / iterates / approves
   → /deskwork:approve <slug> --platform <p>
   → operator pastes the approved copy into the platform UI and posts
   → /deskwork:distribute <slug> --platform <p> --url <posted-url>
```

### Examples

```
/deskwork:distribute my-article --platform linkedin --url https://www.linkedin.com/posts/...
/deskwork:distribute my-article --platform reddit --channel rprogramming --url https://www.reddit.com/r/programming/comments/...
/deskwork:distribute my-article --platform youtube --url https://www.youtube.com/watch?v=... --date 2026-04-26
```

### Error handling

- **Slug not in calendar** — helper lists known slugs and refuses.
- **Entry not Published (no prior record)** — distribution records require the entry to be in `Published` stage. Run `/deskwork:publish <slug>` first. (When updating an existing record this constraint doesn't re-trigger — the record already exists, the helper just sets the URL.)
- **Invalid platform** — helper lists the known platforms. Re-run with the correct value.
