---
id: TASK-32
title: >-
  UX: content type vocabulary (blog/youtube/tool) hard-coded for website use
  case
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-60
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/60

## Friction surfaced during 2026-04-28 dogfood

The `/deskwork:add` skill accepts a content type via `--type`. Allowed values: `blog`, `youtube`, `tool`. That vocabulary fits the audiocontrol.org / writingcontrol use case (a website with blog posts, embedded YouTube videos, and standalone tools) — but for any other content collection it forces a semantic mismatch.

Concretely: marching the omnibus deskwork-plugin PRD through the pipeline, `blog` was the only acceptable value. The PRD is a markdown file under `docs/` (which technically matches the "blog" type's *"lives in this repo under the site's configured contentDir"* shape), but it's not a blog post. It's an internal product-requirements doc.

Other collection types adopters might have:
- Books / manuscripts (chapters)
- Internal documentation (specs, PRDs, design docs, ADRs)
- Engineering plans (the deskwork-plugin source-shipped plan is exactly this)
- Knowledge-base articles
- Whitepapers / research notes

## What changes

This couples to the broader *"deskwork manages collections of markdown content, not websites"* principle in `.claude/CLAUDE.md` and to Phase 24 ([#56](https://github.com/audiocontrol-org/deskwork/issues/56)) — collection support shouldn't bake "blog/youtube/tool" as the universal type vocabulary. Suggested shape:

1. **Make the type field collection-defined**, not a global enum. The collection's config (`.deskwork/config.json`) lists which content types it supports. Default for an unconfigured collection is `["doc"]` (generic markdown). The audiocontrol.org config keeps `["blog", "youtube", "tool"]`.
2. **Add `doc` / `internal-doc` / `spec` as built-in default types.** Most non-website collections want a generic "this is a markdown file" type without renderer assumptions.
3. **CLI accepts any type the collection config declares**, errors on unknown types with a list of valid values for that collection.

## Acceptance

- `.deskwork/config.json` schema gains an optional `contentTypes: string[]` per collection (default: `["doc"]`).
- `deskwork add --type doc "<title>"` works on any non-website collection without forcing a website-flavored type.
- The audiocontrol.org config (or equivalent) declares `["blog", "youtube", "tool"]` and continues to work as before.
- Ingest (`/deskwork:ingest`) infers type from frontmatter or file location per collection rules; falls back to `doc`.
- Studio renders entries with their declared type without assuming the type is one of the legacy three.

## Origin

Surfaced 2026-04-28 by `/deskwork:add --type blog "PRD: deskwork-plugin"` against the `deskwork-internal` collection — an internal-docs collection that has no concept of "blog" or "youtube" or "tool." Part of the Phase 23 dogfood arc. Coordinated with [#56](https://github.com/audiocontrol-org/deskwork/issues/56) (Phase 24 — content collections, not websites).
<!-- SECTION:DESCRIPTION:END -->
