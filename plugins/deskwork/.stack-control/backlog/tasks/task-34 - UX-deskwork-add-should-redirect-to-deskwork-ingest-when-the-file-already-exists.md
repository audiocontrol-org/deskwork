---
id: TASK-34
title: >-
  UX: /deskwork:add should redirect to /deskwork:ingest when the file already
  exists
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-58
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/58

## Friction surfaced during 2026-04-28 dogfood

Marching the omnibus deskwork-plugin PRD through the editorial pipeline. The PRD already exists on disk at `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md`. I used `/deskwork:add` to capture it as a new idea — but `/deskwork:add` is shaped for *new ideas not yet drafted*. Adding an existing markdown file via `/deskwork:add` puts the entry in `Ideas`, then forces a march through `Planned → Outlining → Drafting → Review` even though the content is already written.

The skill that's actually for existing content is `/deskwork:ingest`:

> Backfill existing markdown content into the editorial calendar. Walks files / directories / globs, parses frontmatter, derives slug + state + date with provenance, and (after a dry-run) appends calendar rows + a journal record per file. Use when adopting deskwork on a project that already has published or in-progress posts.

But `/deskwork:add`'s SKILL.md never mentions `/deskwork:ingest`. An adopter (or a coding agent following the skill prose) trying to register an existing document doesn't see the right skill exists.

## What changes

`plugins/deskwork/skills/add/SKILL.md` should recommend `/deskwork:ingest` when the content already exists. Suggested addition near the top of the skill prose:

> ### Already have the file on disk?
>
> `/deskwork:add` is for capturing a new idea before any content exists. If the markdown file is already written and just needs to be registered with the calendar (its frontmatter, current draft state, etc.), use `/deskwork:ingest` instead — it parses the file's frontmatter, derives the right stage from `dateModified` / `datePublished`, and creates a calendar entry already-bound to the file.

Plus an early step in the skill flow: *"Confirm the content does not already exist on disk. If a markdown file already exists for this idea, redirect to `/deskwork:ingest` rather than creating a duplicate Ideas-stage entry."*

## Acceptance

- `plugins/deskwork/skills/add/SKILL.md` references `/deskwork:ingest` near the top with a one-line "for existing content, use ingest" pointer.
- The skill's flow includes a sanity check that the content doesn't already exist (or at least an instruction to confirm with the operator).
- Adopter docs (root README + plugin README) mention both skills' use cases distinctly: `add` for new ideas, `ingest` for existing files.

## Origin

Surfaced 2026-04-28 by running `/deskwork:add "PRD: deskwork-plugin" ...` against an existing PRD file at `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md`. The Ideas-stage entry has slug `prd-deskwork-plugin` but no binding to the existing file. The eventual outline/draft step would either bind to the wrong path (slug-derived `docs/prd-deskwork-plugin.md`) or require a manual rebind. Part of the Phase 23 dogfood arc.
<!-- SECTION:DESCRIPTION:END -->
