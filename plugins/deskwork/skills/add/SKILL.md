---
name: add
description: Capture a new longform-writing idea — blog post, essay, design spec, ADR, RFC, internal memo, chapter, runbook, or any markdown writeup — and create a fresh Ideas-stage entry with sidecar + scaffolded idea.md. Supports per-lane creation (visual mockups, QA plans, custom pipelines) via --lane / --stage / --kind.
---

## Add

Create a new calendar entry for a content idea. Entries land in a lane's first pipeline stage by default; lane / stage / artifact-kind can each be specified explicitly to seed a non-editorial entry (a visual mockup, a QA-plan ticket, an HTML deliverable).

> **Already have the content on disk? Use `/deskwork:ingest` instead.** (#58)
> `/deskwork:add` is for a *new* idea not yet written — it scaffolds an empty
> `idea.md` and starts the entry at **Ideas**, then expects a march through
> Planned → Outlining → Drafting. If a markdown file with the content already
> exists (a drafted PRD, an essay, an imported post), `/deskwork:ingest`
> backfills it into the calendar at the *right* stage and binds `deskwork.id`
> into the existing file's frontmatter — no empty stub, no needless march.

### Input

```
/deskwork:add <slug> "<title>"
/deskwork:add <slug> "<title>" --description "<description>" --keywords "<kw1,kw2>"
/deskwork:add <slug> --lane <lane-id>
/deskwork:add <slug> --lane <lane-id> --stage <stage>
/deskwork:add <slug> --lane <lane-id> --stage <stage> --kind <artifact-kind>
```

The dashboard's per-lane compose chip emits commands of the third / fourth shapes — the operator pastes the chip-copied command into chat and this skill executes it against the right lane.

### Flags

- `--lane <lane-id>` — the lane to bind the new entry to (must already exist under `.deskwork/lanes/<lane-id>.json`). Defaults to `default` when omitted — the bootstrap-default lane bound to the `editorial` pipeline template. When the operator names an explicit lane that does not yet exist, the command refuses with the loader's full error (lane id + file path + advice on how to create it).
- `--stage <stage>` — the stage to place the new entry in. Must be one of the lane's pipeline template's `linearStages ∪ offPipelineStages`. Defaults to the first entry in the template's `linearStages` (usually `Ideas` for editorial, `Sketched` for visual). Stage names may contain spaces — quote them: `--stage "QA Review"`.
- `--kind <markdown|html-mockup|single-file-html|image>` — the artifact-kind classification persisted to the entry sidecar. Defaults to `markdown`. Use `html-mockup` for visual design directories that contain `index.html`; `single-file-html` for one-off HTML files; `image` for raster / vector deliverables.
- `--description "<desc>"`, `--keywords "<kw1,kw2>"` — optional metadata as before.
- `--site <slug>`, `--source <manual|analytics>`, `--content-url <url>`, `--type <blog|youtube|tool>` — legacy editorial flags carried forward for back-compat.

### Examples

```
/deskwork:add blog-post-x --lane blog-lane --stage "Drafting" --kind markdown
/deskwork:add design-x   --lane mockups   --stage "Iterating" --kind html-mockup
/deskwork:add qa-ticket  --lane qa-plan   --stage "QA Review"
/deskwork:add hero-img   --lane visual    --stage Sketched --kind image
```

### Steps

0. **Existing-content check (#58).** If the content already exists as a
   markdown file on disk, STOP and use `/deskwork:ingest <file>` instead —
   `add` is only for ideas not yet written. Proceed below only for a genuinely
   new idea.
1. Resolve project root (default: current working directory).
2. Generate entry uuid: `node -e "console.log(require('crypto').randomUUID())"`.
3. Resolve the lane via `loadLaneConfig(--lane)` and its pipeline template. Validate `--stage` against `template.linearStages ∪ template.offPipelineStages` — reject with the legal stage list on mismatch.
4. Build entry sidecar:

```
{
  "uuid": "<generated>",
  "slug": "<slug-arg>",
  "title": "<title-arg>",
  "description": "<description-arg or omit>",
  "keywords": ["<kw1>", "<kw2>"],
  "source": "manual",
  "currentStage": "<resolved stage>",
  "iterationByStage": {},
  "lane": "<resolved lane-id>",
  "artifactKind": "<resolved kind>",
  "createdAt": "<ISO 8601 now>",
  "updatedAt": "<ISO 8601 now>"
}
```

5. Use the Write tool to create `.deskwork/entries/<uuid>.json` with the sidecar content.
6. Use the Write tool to scaffold `<contentDir>/<slug>/scrapbook/idea.md` with frontmatter:

```
---
title: <title>
deskwork:
  id: <uuid>
  stage: <resolved stage>
  iteration: 0
---

# <title>

(idea body — operator iterates from here)
```

7. Append a journal event by using the Write tool to create `.deskwork/review-journal/history/<timestamp>-<random>.json`:

```
{
  "kind": "entry-created",
  "at": "<ISO 8601 now>",
  "entryId": "<uuid>",
  "entry": <full sidecar JSON from step 4>
}
```

8. Run `deskwork doctor` to regenerate `calendar.md` and validate.

### Error handling

- **Slug already exists.** Refuse with: "slug <slug> exists; use /deskwork:status <slug> to view."
- **Unknown lane.** When `--lane` names a lane whose JSON file is missing under `.deskwork/lanes/`, refuse with the loader's full error message (lane id + expected path + advice). Do not auto-create explicit lanes — only the default lane is bootstrapped when `--lane` is omitted on a legacy project.
- **Invalid stage.** When `--stage` is supplied but is not in the lane template's `linearStages ∪ offPipelineStages`, refuse with the full legal-stage list so the operator can correct without grepping the template JSON.
- **Invalid kind.** When `--kind` is supplied but is not one of `markdown | html-mockup | single-file-html | image`, refuse with the legal-kind list.
- **Doctor reports validation failure after add.** Surface to operator; revert by deleting the sidecar, idea.md, and journal event files.

### Adjacent assets — drop them in the entry's scrapbook

When the operator wants to attach research artifacts (screenshots, mockups, source PDFs, reference images, captured data) to an entry, those belong in the entry's `scrapbook/` directory, adjacent to the content file. The plugin already serves them: the studio renders them in the scrapbook viewer at `/dev/scrapbook/<site>/<path>` and composes them into the review surface via the scrapbook drawer; binary files are reachable via `/api/dev/scrapbook-file?site=…&entryId=…&name=…` (entry-id mode — works for any project layout, including `docs/<version>/<status>/<feature>/`) or the slug-shape `?path=…&name=…` mode for projects whose entries follow the kebab-case slug template.

Do NOT create sibling directories like `<entry>-screenshots/` or `<entry>-images/` for related assets — the scrapbook is the home for them. Sibling directories bypass the existing serving infrastructure and produce broken-image regressions on the review surface (this is a real failure mode the project already hit; see `THESIS.md` Consequence 3 for the architectural reasoning).
