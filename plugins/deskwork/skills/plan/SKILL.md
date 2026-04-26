---
name: plan
description: Move an Ideas entry to the Planned stage and set target SEO keywords (and optional topic tags). Use once an idea is committed to.
---

## Plan

Commit to an idea by moving it from Ideas to Planned and setting target SEO keywords.

### Input

The user provides a slug and keywords. Examples:

- `/deskwork:plan scsi-protocol-deep-dive "SCSI protocol, vintage hardware, SCSI commands"`
- `/deskwork:plan agent-as-workflow  one two three`  (space-separated also works)
- `/deskwork:plan scsi-protocol-deep-dive`  (will prompt for keywords)

If the project has multiple sites, `--site <slug>` selects which calendar to update.

### Topics (optional)

After keywords, optionally prompt for **topics** — coarse tags used for cross-posting lookups by later skills. Blank is fine. If the project has a configured `channelsPath`, suggest topic values from the channel names in that file. Otherwise, free-form comma-separated.

### Steps

1. Resolve `--site` (or default).
2. Confirm the slug exists in Ideas. If not, surface the helper's error (it lists available slugs).
3. Collect keywords — from the user's argument or by prompting.
4. Optionally collect topic tags.
5. Invoke the helper:

```
deskwork plan [--site <slug>] [--topics t1,t2,...] \
                 <slug> [<keyword1> <keyword2> ...]
```

Keywords may be passed as separate positionals or a single comma-separated string — both collapse to the same list.

6. Report: slug, new stage (Planned), keywords, topics. Suggest `/deskwork:draft <slug>`.

### Error handling

- If the helper reports the entry is not in Ideas, surface its current stage. Do NOT try to force the move.
- If the slug is unknown, do not invent a new one — stop and report the available slugs.
