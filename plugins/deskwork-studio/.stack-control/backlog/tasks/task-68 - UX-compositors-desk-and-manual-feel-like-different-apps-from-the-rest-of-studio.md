---
id: TASK-68
title: >-
  UX: compositor's desk and manual feel like different apps from the rest of
  studio
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-180
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Child of #158 (Phase 34d split).

## Trigger

Operator-noted in #158: "The compositor's desk and manual seem like different apps altogether."

## Surfaces

- `/dev/editorial-review-shortform` (compositor's desk)
- `/dev/editorial-help` (compositor's manual)

Both render at the same studio surface as the dashboard / index / content / scrapbook, but visually they're divergent enough to feel like a separate application. Operator's screenshots in #158 show the contrast.

## Candidate fix

Audit each surface's chrome against the dashboard's visual contract:

- Folio header? (`renderEditorialFolio` already standardized).
- Page-content max-width / container conventions?
- Header / kicker rendering pattern?
- Color tokens / typography pairings?

Most likely cause: the two surfaces predate the recent visual unification work (Phase 33 review-redesign + Phase 34 chrome port) and weren't pulled forward. Each needs a targeted update to consume the same design tokens + composition patterns as the post-Phase-33 surfaces.

## Filed under

Phase 34d's #158 split. Operator-driven design pass.
<!-- SECTION:DESCRIPTION:END -->
