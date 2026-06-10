---
id: TASK-33
title: 'UX: no way to remove a calendar entry added by mistake (only pause exists)'
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-59
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/59

## Friction surfaced during 2026-04-28 dogfood

Marching the omnibus deskwork-plugin PRD through the editorial pipeline. Realized partway through (per [#58](https://github.com/audiocontrol-org/deskwork/issues/58)) that I should have used `/deskwork:ingest`, not `/deskwork:add`. Wanted to delete the wrong entry and start over.

There is no delete / remove subcommand. The closest is `/deskwork:pause`, which moves the entry to the `Paused` stage — but the entry is still in the calendar, taking up a row, with `pausedFrom` metadata pointing at a stage I don't actually want to resume. The only real recovery path is hand-editing `.deskwork/calendar.md` to remove the row.

## What's missing

A way to remove an entry from the calendar entirely, for the "added by mistake" case. Pausing isn't right — pause is for *"actively-not-working-on, may resume."* This is *"never should have been added in the first place."*

## Proposed shape

- New subcommand `deskwork remove <slug>` (and corresponding `/deskwork:remove` skill).
- Refuses to remove entries that have an open review workflow — operator must `/deskwork:review-cancel` first.
- Refuses to remove entries that are bound to a file on disk (deskwork.id frontmatter), unless `--force` — protects against blasting away calendar entries for live content.
- Writes a journal record for the removal so audit history is preserved.
- Suggested skill prose calls out: *"Use `/deskwork:pause` instead if you might come back to this. `remove` is for entries that should never have been created."*

## Acceptance

- `deskwork remove prd-deskwork-plugin` removes the row from the calendar atomically.
- Journal records the removal (kind: `entry-removed`, includes the prior stage and entry data for audit).
- A removed slug becomes available for re-use (no duplicate-slug error if the operator re-adds the same title).
- The skill prose distinguishes pause vs. remove clearly.

## Origin

Surfaced 2026-04-28 by needing to undo `/deskwork:add prd-deskwork-plugin` after realizing `/deskwork:ingest` was the right skill ([#58](https://github.com/audiocontrol-org/deskwork/issues/58)). Recovered manually by editing `.deskwork/calendar.md` to remove the row. Part of the Phase 23 dogfood arc.
<!-- SECTION:DESCRIPTION:END -->
