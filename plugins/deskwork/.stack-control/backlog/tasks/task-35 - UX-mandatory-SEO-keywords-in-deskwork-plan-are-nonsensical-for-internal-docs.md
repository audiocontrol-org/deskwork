---
id: TASK-35
title: 'UX: mandatory SEO keywords in /deskwork:plan are nonsensical for internal docs'
status: To Do
assignee: []
created_date: '2026-06-10 19:01'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-57
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/57

## Friction surfaced during 2026-04-28 dogfood

Marching the omnibus deskwork-plugin PRD through the editorial pipeline (`/deskwork:add` → `/deskwork:plan` → ...) to surface adoption friction. `/deskwork:plan` requires SEO keywords. SEO keywords are nonsensical for internal documents (PRDs, design specs, internal write-ups, books not yet published, drafts intended for non-SEO surfaces) — there's no search index they're optimizing for.

## What happens today

- `plugins/deskwork/skills/plan/SKILL.md` says: *"Commit to an idea by moving it from Ideas to Planned and setting target SEO keywords."*
- The CLI accepts keywords as positional args or comma-separated; both collapse to `targetKeywords[]` in the calendar entry.
- Marching a PRD through, you must invent keywords (I used `deskwork-plugin prd feature-tracking internal-doc` as descriptive tags) just to get past the stage transition. The values are stored on disk and never used for anything an internal doc cares about.

## Proposed shape

Either:

1. **Make keywords optional**, with the SKILL prose updated to say *"set target SEO keywords (optional — skip for non-SEO content like internal docs / specs / PRDs)."* The CLI accepts an empty list.
2. **Generalize the field** from `targetKeywords` (SEO-flavored) to `tags` (generic), with the skill prompt asking *"any tags? (SEO keywords if you're optimizing for search, descriptive tags otherwise; blank to skip)."*

Option 2 aligns with the broader "deskwork manages collections of markdown content, not websites" principle (`.claude/CLAUDE.md`) — calling them "SEO keywords" implies a website target the collection may not have.

Option 1 is the smaller change — keep the field name + intent, just stop forcing a value.

## Acceptance

- Plan skill accepts an entry with no keywords/tags. Calendar persists an empty array; no errors.
- SKILL.md prose communicates that keywords are optional and SEO-flavored (or renamed to `tags` per option 2).
- Doctor doesn't flag the empty-keywords case as a defect.

## Origin

Surfaced 2026-04-28 by adding `prd-deskwork-plugin` to the `deskwork-internal` collection (PRD is at `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md`). Part of the Phase 23 dogfood arc — the operator framed it: *"march it through the process to find friction points."*
<!-- SECTION:DESCRIPTION:END -->
