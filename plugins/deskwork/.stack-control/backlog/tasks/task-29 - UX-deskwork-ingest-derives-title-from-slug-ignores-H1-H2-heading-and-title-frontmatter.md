---
id: TASK-29
title: >-
  UX: /deskwork:ingest derives title from slug, ignores H1/H2 heading and title
  frontmatter
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-64
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/64

## Friction surfaced during 2026-04-28 dogfood

`/deskwork:ingest` derives the calendar entry's `title` from the slug, not from the file's H1/H2 heading or a frontmatter `title:` field.

Concretely:

```
$ head -1 docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md
## PRD: deskwork-plugin

$ deskwork ingest docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md --apply
$ grep deskwork-plugin/prd .deskwork/calendar.md
| 9845c268-670f-4793-b986-0433e9ef4fb9 | deskwork-plugin/prd | Prd |  |  | manual |
```

Title in the calendar: **`Prd`** (the slug's last segment, titlecased) — not **`PRD: deskwork-plugin`** (the actual document heading).

This is wrong for any file with a meaningful heading. Adopters running ingest across an existing content tree will end up with a calendar full of slug-derived titles like `Foo`, `Bar`, `My-Post-About-X` — not the actual titles the documents declare.

## What changes

Title-derivation waterfall:

1. `title:` frontmatter field (when present)
2. First H1 (`# Title`) in the file body
3. First H2 (`## Title`) in the file body — only if no H1 exists
4. Slug-derived titlecase (current behavior — last fallback)

Source for the derived value should be recorded in the dry-run plan, the same way slug/state/date sources already are:

```
add  deskwork-plugin/prd       Ideas       2026-04-28    slug:path state:default date:mtime title:h2
```

## Acceptance

- `ingest` reads `title:` frontmatter first, then H1, then H2, then falls back to slug-titlecase.
- The dry-run plan shows the title source (`title:frontmatter`, `title:h1`, `title:h2`, `title:slug`).
- Ingesting a file with `# Hello World` produces a calendar entry titled `Hello World`, not `Hello-World` or `Foo` (its slug).
- Ingesting a file with `title: My Custom Title` in frontmatter wins over any H1/H2 in the body.

## Origin

Surfaced 2026-04-28 by ingesting `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md`. The calendar entry's title rendered as `Prd` instead of the H2's `PRD: deskwork-plugin`. Part of the Phase 23 dogfood arc.
<!-- SECTION:DESCRIPTION:END -->
