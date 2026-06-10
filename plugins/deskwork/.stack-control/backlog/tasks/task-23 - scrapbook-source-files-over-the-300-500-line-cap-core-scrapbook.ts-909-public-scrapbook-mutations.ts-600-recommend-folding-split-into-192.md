---
id: TASK-23
title: >-
  scrapbook source files over the 300-500 line cap (core/scrapbook.ts:909,
  public/scrapbook-mutations.ts:600); recommend folding split into #192
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-202
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/202

**Symptom**

Two scrapbook-related files exceed the 300–500-line cap mandated by `/Users/orion/work/CLAUDE.md` and `.claude/CLAUDE.md`:

- `packages/core/src/scrapbook.ts` — **909 lines** as of #191's landing (was 780 lines pre-#191 — already over the cap; #191 added 129 lines of `*AtDir` entry-aware mutation primitives).
- `plugins/deskwork-studio/public/src/scrapbook-mutations.ts` — **600 lines** (was 565 pre-#191; #191 added 35 lines for the `Ctx.entryId` field, `payload()` helper, and upload entry-id branch).

Both were already over the cap before #191; #191's necessary additions made them worse.

## Refactor candidate (core/src/scrapbook.ts)

Reasonable split mirrors the responsibilities the file already separates internally:

- `scrapbook/types.ts` — public types, ScrapItem, ScrapKind, etc.
- `scrapbook/paths.ts` — slug-template + entry-aware path resolvers.
- `scrapbook/listing.ts` — `listScrapbook`, `listScrapbookAtDir`, kind heuristics.
- `scrapbook/crud.ts` — slug-template mutation primitives (create/save/rename/delete, plus upload).
- `scrapbook/crud-at-dir.ts` — entry-aware `*AtDir` mutation primitives (added by #191).
- `scrapbook/seed.ts` — content/template scaffolding helpers (if any are still in there).

This split keeps `@deskwork/core/scrapbook` as a barrel re-export; existing import sites don't change.

## Refactor candidate (public/src/scrapbook-mutations.ts)

Per-action split would line up with the `affordance-placement.md` rule's spirit (each mutation has its own client surface):

- `scrapbook-mutations/payload.ts` — the `Ctx` + `payload()` helper.
- `scrapbook-mutations/composer.ts` — composer mount + state.
- `scrapbook-mutations/upload.ts` — drop-zone + multipart upload.
- `scrapbook-mutations/edit.ts` — edit-existing affordance.
- `scrapbook-mutations/rename.ts` / `delete.ts` / `secret-toggle.ts` — per-mutation modules.
- The barrel re-exports for the index.

## Coupling with #192

#192 already plans to collapse the dual scrapbook resolvers — making `scrapbookDir(slug)` and `scrapbookFilePath(slug)` non-exported. That's a natural moment to split the file: while moving the slug-template resolvers to private helpers inside the module, splitting them into a dedicated submodule has near-zero additional cost.

**Recommendation:** fold this into #192's scope rather than do it as a standalone follow-up. #192 is already scheduled to touch every export site of those helpers; an additional sub-task to land the split costs less than a separate dispatch.

## Why filing now

Per `.claude/rules/agent-discipline.md` (the "no 'just for now' shortcuts" rule): *"every concern in DONE_WITH_CONCERNS must end in one of these four dispositions: (1) addressed in this commit, (2) filed as a GitHub issue with link, (3) scoped into a downstream dispatch whose plan/spec you have read and verified explicitly contains the deferred work, or (4) explicit operator decision to defer with documented acceptance criteria."*

The dispatch agent that landed #191 surfaced these concerns; the dispatch's scope was bounded to #191's shape, so they're filed here as separate issues rather than smuggled into #191 as TODO comments.
<!-- SECTION:DESCRIPTION:END -->
