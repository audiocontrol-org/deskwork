---
id: TASK-64
title: >-
  marginalia: client UI for category edits (server already in v0.16.0; range
  edit wontfix per #203)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-204
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Symptom

After the [#199](https://github.com/audiocontrol-org/deskwork/issues/199) fix landed text-edit + delete affordances on marginalia comment cards, the operator can refine a comment's text in place — but the comment's `category` field (one of `voice` / `clarity` / `factual` / `other` / etc.) is not editable post-creation. To re-categorize a comment, the operator has to delete it and re-create it from scratch, losing the comment's id continuity (and any address annotations that reference it).

This is the same UX gap that motivated #199, just applied to a different field. Operator's framing during the audit-doc iteration:

> We *should* implement the category edit capability, so that needs to be tracked as part of this tranche of bug fixes in the prd, workplan, and github issue.

## Server-side state

Already done as part of [#199](https://github.com/audiocontrol-org/deskwork/issues/199). The PATCH endpoint at `/api/dev/editorial-review/entry/:entryId/comments/:commentId` accepts `{ text?, range?, category?, anchor? }`. Calling it with a `category` change mints an `edit-comment` annotation that the folder applies to the comment's view. So the server-side work is complete; only the client UI is missing.

## Client-side scope

Extend the inline edit affordance in `plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts` and `sidebar-render.ts`:

1. When entering edit mode for a comment card, expose a category dropdown alongside the text textarea. Pre-populate with the comment's current category.
2. On save, if the category differs from the current value, include `category` in the PATCH body. (If only text changed, send only text — minimize the journal record's payload.)
3. The dropdown options should be the `AnnotationCategory` enum values from the schema. Find the canonical list in `packages/core/src/schema/draft-annotation.ts` (or wherever the enum is declared).
4. Mirror the `affordance-placement.md` rule — the category control lives ON the comment card during edit mode, not in a toolbar. Same pattern as the text textarea.

## Tests

- Server-route tests for category-only PATCH already exist as part of #199's regression suite (`packages/studio/test/entry-comment-edit-delete.test.ts`). New client UI tests for the dropdown's pre-population + change emission.
- Live walk: edit a comment, change its category, save, reload — confirm the category change persisted and the folded read shows the new category.

## Why filing as a separate issue

Operator scope decision during audit-doc iteration: range editing → wontfix (#203 closed); category editing → in-scope, separate tracker. The #199 fix shipped on `feature/deskwork-open-issue-tranche-cleanup` already, so a new issue keeps the trackers crisp rather than re-opening #199.

## Disposition

In-scope for the open-issue-tranche-cleanup branch (Phase 7 extension). PRD §Phase 7, workplan Phase 7 Task 3, and feature README updated alongside this issue's filing.
<!-- SECTION:DESCRIPTION:END -->
