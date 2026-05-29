---
name: add
description: Capture a new longform-writing idea — blog post, essay, design spec, ADR, RFC, internal memo, chapter, runbook, or any markdown writeup — and create a fresh Ideas-stage entry with sidecar + scaffolded idea.md.
---

## Add

Create a new Ideas-stage calendar entry for a content idea.

### Input

```
/deskwork:add <slug> "<title>"
/deskwork:add <slug> "<title>" --description "<description>" --keywords "<kw1,kw2>"
```

### Steps

1. Resolve project root (default: current working directory).
2. Generate entry uuid: `node -e "console.log(require('crypto').randomUUID())"`.
3. Build entry sidecar:

```
{
  "uuid": "<generated>",
  "slug": "<slug-arg>",
  "title": "<title-arg>",
  "description": "<description-arg or omit>",
  "keywords": ["<kw1>", "<kw2>"],
  "source": "manual",
  "currentStage": "Ideas",
  "iterationByStage": {},
  "createdAt": "<ISO 8601 now>",
  "updatedAt": "<ISO 8601 now>"
}
```

4. Use the Write tool to create `.deskwork/entries/<uuid>.json` with the sidecar content.
5. Use the Write tool to scaffold `<contentDir>/<slug>/scrapbook/idea.md` with frontmatter:

```
---
title: <title>
deskwork:
  id: <uuid>
  stage: Ideas
  iteration: 0
---

# <title>

(idea body — operator iterates from here)
```

6. Append a journal event by using the Write tool to create `.deskwork/review-journal/history/<timestamp>-<random>.json`:

```
{
  "kind": "entry-created",
  "at": "<ISO 8601 now>",
  "entryId": "<uuid>",
  "entry": <full sidecar JSON from step 3>
}
```

7. Run `deskwork doctor` to regenerate `calendar.md` and validate.

### Error handling

- **Slug already exists.** Refuse with: "slug <slug> exists; use /deskwork:status <slug> to view."
- **Doctor reports validation failure after add.** Surface to operator; revert by deleting the sidecar, idea.md, and journal event files.

### Adjacent assets — drop them in the entry's scrapbook

When the operator wants to attach research artifacts (screenshots, mockups, source PDFs, reference images, captured data) to an entry, those belong in the entry's `scrapbook/` directory, adjacent to the content file. The plugin already serves them: the studio renders them in the scrapbook viewer at `/dev/scrapbook/<site>/<path>` and composes them into the review surface via the scrapbook drawer; binary files are reachable via `/api/dev/scrapbook-file?site=…&entryId=…&name=…` (entry-id mode — works for any project layout, including `docs/<version>/<status>/<feature>/`) or the slug-shape `?path=…&name=…` mode for projects whose entries follow the kebab-case slug template.

Do NOT create sibling directories like `<entry>-screenshots/` or `<entry>-images/` for related assets — the scrapbook is the home for them. Sibling directories bypass the existing serving infrastructure and produce broken-image regressions on the review surface (this is a real failure mode the project already hit; see `THESIS.md` Consequence 3 for the architectural reasoning).
