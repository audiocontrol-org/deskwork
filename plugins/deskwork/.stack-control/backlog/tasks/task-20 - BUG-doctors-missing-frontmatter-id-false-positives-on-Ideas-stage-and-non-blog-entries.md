---
id: TASK-20
title: >-
  BUG: doctor's missing-frontmatter-id false-positives on Ideas-stage and
  non-blog entries
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-219
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/219

## Bug: doctor's `missing-frontmatter-id` rule fires on entries that legitimately have no markdown file

### Symptom

After a clean v0.16.0 install with sidecars correctly populated for every calendar entry (via `deskwork doctor --fix=all` or — in our case — a one-shot migration script while #218 lands), `deskwork doctor` still reports `missing-frontmatter-id` findings for entries that **have no markdown file by design**:

- Ideas-stage entries (`idea.md` is supposed to be auto-scaffolded on first iterate per the Phase 30 docs, so a fresh Ideas entry has no markdown yet)
- Planned-stage entries that haven't been iterated yet
- Non-blog content types — YouTube videos, tools — that never have markdown

In our case, doctor reports 15 such findings. Drilling in:

- 12 are Ideas-stage entries (no `idea.md` yet because the operator hasn't iterated on them).
- 1 is Planned without `plan.md` yet.
- 2 are Published-stage entries with `contentType: youtube` and `contentType: tool` (the legacy calendar's Published-table column "Type" → these never have markdown; the artifact is a YouTube URL or a tool's URL respectively).

The first two classes "fix themselves" once the operator iterates. The third class — non-blog content — will *never* have a frontmatter-bound markdown file. Doctor flags them anyway.

### Reproduction

1. Project with both blog entries (have `index.md`) and non-blog entries (YouTube/tool — `contentType` is non-blog, no markdown).
2. Migrate (or have already migrated) all entries into sidecars at `.deskwork/entries/<uuid>.json`.
3. Run `deskwork doctor`.
4. Observe `missing-frontmatter-id` findings for every Ideas-stage entry and every YouTube/tool entry.

### Likely cause

The `missing-frontmatter-id` rule (`@deskwork/core/dist/doctor/rules/missing-frontmatter-id`) checks: *for each calendar entry, is there a markdown file with matching `deskwork.id` frontmatter?*

In the pre-Phase-30 model, every calendar entry was expected to have a markdown counterpart (or be on its way to one). In Phase 30, that contract changed:

- Sidecars are the source-of-truth, not markdown files.
- Per-stage artifact files (`idea.md` / `plan.md` / `outline.md` / `index.md`) are scaffolded by `iterate` — not all entries have artifacts.
- Non-blog content types (YouTube, tool) never have artifacts.

So the rule is enforcing a pre-Phase-30 invariant that no longer holds.

### Suggested fix (in priority order)

1. **Stage-aware skip.** Skip the rule for entries whose `currentStage` is one where artifacts haven't been scaffolded yet (`Ideas` if `idea.md` doesn't exist, `Planned` if `plan.md` doesn't exist, etc.). Only fire when the artifact *should* exist per the per-stage scaffolding contract.
2. **ContentType-aware skip.** If the entry has `contentType: youtube | tool | …non-blog…`, the rule shouldn't fire at all. **Caveat:** the current `EntrySchema` (per `@deskwork/core@0.16.0/dist/schema/entry.js`) has no `contentType` field, so this would require either re-adding it or inferring contentType from the legacy calendar's `Type` column during migration. (See related: the Phase 30 entry-centric model dropped contentType, which means there's currently no way for a sidecar to express "this is a YouTube video, not a blog post" — separate issue worth raising.)
3. **Retire the rule.** In Phase 30 the binding direction reversed: sidecars are authoritative; markdown files are downstream artifacts. The check that "every calendar UUID has matching markdown frontmatter" was meaningful when calendar.md was the source-of-truth — it isn't anymore. The narrower invariants (`file-presence`, `orphan-frontmatter-id`) cover what this rule used to enforce, more precisely.

### Acceptance

- After migrating to sidecars, `deskwork doctor` reports 0 false-positive findings on entries that legitimately have no markdown:
  - Ideas/Planned with no per-stage artifact yet
  - YouTube / tool content types

### Origin

Surfaced 2026-05-06 immediately after manually migrating a project from the legacy calendar.md format to per-entry sidecars (workaround for #218). Doctor's `file-presence` is now clean — the binding works — but `missing-frontmatter-id` still reports 15 findings on entries that never need markdown. The persistent noise makes it hard to spot real findings later.
<!-- SECTION:DESCRIPTION:END -->
