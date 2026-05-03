---
name: add
description: Create a new Ideas-stage entry with sidecar + scaffolded idea.md
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
