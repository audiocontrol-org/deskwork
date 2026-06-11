---
id: TASK-27
title: >-
  stack-control: roadmap add cannot author item prose — the governed format
  displays a description the verb can't write
status: To Do
assignee: []
created_date: '2026-06-11 00:41'
updated_date: '2026-06-11 00:42'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-449
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stack-control tooling friction, surfaced while seeding the design-control roadmap (2026-06-10).

## Symptom

The governed `ROADMAP.md` instructs "manage the graph with `stackctl roadmap` — do not hand-edit", and the roadmap grammar + the plugin's own ROADMAP.md render a prose description line per item — but `roadmap add` accepts only `--status/--scope/--depends-on/--part-of/--deferred-until/--spec/--ref`. There is no flag that authors the item's prose body, and no other mutation verb covers it.

## Why it matters

An adopter seeding a roadmap through the front door ends up with heading-and-bullets items and no way to attach the one-line description the format itself displays (the stack-control program's own roadmap items all carry one). The choice is hand-editing a file marked do-not-hand-edit, or shipping a roadmap that's less readable than the tool's own. The design-control roadmap took the second option; its items carry no prose.

## Suggested fix

A `--summary "<text>"` (or trailing positional) on `roadmap add`, plus an `edit`/`describe` mutation for existing items — whole-document re-validation like the other mutations.

## Provenance

Observed seeding the 7-item design-control phase graph (deskwork commit 9869487a). Filed per the tooling-friction-to-GitHub-issues policy.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Observation 2026-06-11: in installed v0.42.0, roadmap add --scope wrote full multi-sentence item prose successfully (design:feature/backlog-backend-port landed with its complete description). Either fixed since filing or the defect is narrower than the title suggests — re-verify the exact repro before working this item.
<!-- SECTION:NOTES:END -->
