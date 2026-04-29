---
name: shortform-start
description: Start a shortform draft (LinkedIn / Reddit / YouTube / Instagram) for a Published or Drafting calendar entry. Creates a markdown file in the entry's scrapbook + a review workflow; reports the studio URL where the operator edits and approves. The file is the SSOT — same review pipeline as longform.
---

## Shortform Start

Begin a shortform composition cycle for an entry already on the calendar. The shortform copy lives in a real markdown file (one per `(slug, platform, channel?)` triple) inside the entry's scrapbook. The studio's review surface renders the workflow with a small platform/channel header above the same markdown editor used for longform — save / iterate / approve / reject all behave identically.

### When to use

- You have a Published longform article and want to author a LinkedIn (or Reddit, YouTube, Instagram) post about it. The agent driving this skill can draft the initial body from the published longform when the operator wants to bootstrap from existing copy.
- You want to draft a shortform for a calendar entry at any stage that has a per-entry directory. Shortform is decoupled from the longform lifecycle — it doesn't require the entry to be Published.

### Input

```
/deskwork:shortform-start <slug> --platform <p>
/deskwork:shortform-start --site <s> <slug> --platform <p> --channel <c>
/deskwork:shortform-start <slug> --platform <p> --initial-markdown "Draft text..."
```

If Claude is driving and the operator hasn't supplied every argument, prompt one at a time — slug → platform → optional channel → optional initial draft. Do NOT collect everything in one prompt; one-arg-at-a-time keeps the review loop snappy when the operator changes their mind mid-flow.

### Required arguments

- `<slug>` — the calendar entry slug. Hierarchical slugs (`the-outbound/characters/strivers`) are supported.
- `--platform` — one of `reddit`, `youtube`, `linkedin`, `instagram`.

### Optional arguments

- `--site <s>` — defaults to `config.defaultSite` (or the only site for single-site projects).
- `--channel <c>` — kebab-case sub-channel (e.g. `rprogramming` for `r/programming`, a YouTube channel handle, a LinkedIn page slug). Required for platforms where multiple channels matter (typically Reddit).
- `--initial-markdown <text>` — raw markdown body for the file. Leave off for an empty draft. When the agent is composing, write the initial draft here so the operator opens the studio and sees a starting point rather than a blank textarea.

### Steps

1. Resolve `--site` (or default).
2. If the operator wants the initial draft seeded from the published longform, the agent reads the longform body (use the `findEntryFile` content-index lookup if available, otherwise the slug-template path) and shapes a platform-appropriate version. Pass it as `--initial-markdown`.
3. Invoke the helper:

```
deskwork shortform-start [--site <slug>] --platform <p> [--channel <c>] [--initial-markdown <text>] <slug>
```

The helper:

- Resolves the calendar entry by slug (refuses if not found)
- Computes the file path: `<contentDir>/<slug>/scrapbook/shortform/<platform>[-<channel>].md` (Phase 20 sandbox migration will move this — the path is centralized through `resolveShortformFilePath` so callers stay unchanged)
- Scaffolds the file when missing (frontmatter carries `deskwork: { id, platform, channel? }`; body is `--initial-markdown` or empty)
- Calls the kind-agnostic workflow creator — idempotent on `(entryId | site+slug, platform, channel?)`. Resuming an existing workflow returns it unchanged.

4. Report to the operator: workflow id, the studio review URL path (`/dev/editorial-review/<id>`), and the on-disk file path. Suggest opening the URL in the running studio. The operator's studio is on whatever port they chose — only the path is reported.

### Output

The helper emits JSON with `workflowId`, `reviewUrl` (path only), `filePath`, `platform`, and (when supplied) `channel`. The operator-facing summary should highlight the review URL — that's where editing happens.

### Examples

```
/deskwork:shortform-start my-article --platform linkedin
/deskwork:shortform-start my-article --platform reddit --channel rprogramming
/deskwork:shortform-start my-article --platform linkedin --initial-markdown "Draft text starting from the lede of the published article..."
```

### File location

```
<contentDir>/<slug>/scrapbook/shortform/
  linkedin.md                 (platform-only)
  reddit-rprogramming.md      (platform + channel; channel kebab-cased into filename)
  youtube.md
```

Phase 20 introduces a deskwork content sandbox; when it lands, these files move out of the host's `<contentDir>` into the sandbox in one pass. Skill prose stays the same — only the helper's resolver changes.

### After approve

The operator iterates and approves in the studio. Once approved, manually post the shortform to the platform, then run:

```
/deskwork:distribute <slug> --platform <p> --url <posted-url>
```

That records the posted URL on the calendar's distribution record so the dashboard matrix shows the cell as covered.

### Error handling

- **Slug not in calendar** — helper refuses. Run `/deskwork:add` (or the project's content ingest flow) to register the entry first.
- **Invalid platform** — helper lists the known platforms. Re-run with the correct value.
- **Invalid channel** — channels must be kebab-case (`[a-z0-9][a-z0-9-]*`). Helper refuses with the regex shown.
- **Resuming an existing workflow** — helper returns the existing workflow unchanged (`fresh: false`). The on-disk file is also left untouched. This is expected idempotence — open the review URL to continue editing.
