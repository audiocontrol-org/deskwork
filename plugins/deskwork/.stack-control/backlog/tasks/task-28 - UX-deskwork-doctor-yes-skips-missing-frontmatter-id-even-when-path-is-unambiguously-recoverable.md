---
id: TASK-28
title: >-
  UX: deskwork doctor --yes skips missing-frontmatter-id even when path is
  unambiguously recoverable
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-65
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/65

## Friction surfaced during 2026-04-28 dogfood

`deskwork doctor --fix=missing-frontmatter-id --yes` skips ambiguous cases. For a calendar entry created via ingest with a hierarchical slug (e.g., `deskwork-plugin/prd`), doctor can detect the missing binding but can't auto-resolve which file to write the `deskwork.id` frontmatter into:

```
$ deskwork doctor --fix=missing-frontmatter-id --yes
Doctor: 1 finding(s) across 1 site(s)
[missing-frontmatter-id] Calendar entries with no matching frontmatter id (1)
  - Entry "deskwork-plugin/prd" (id 9845c268-...) is not bound to any file

Repairs:
  missing-frontmatter-id: 0 applied, 1 skipped (ambiguous; re-run interactively to choose)
```

The slug `deskwork-plugin/prd` could plausibly map to many files in the content tree:
- `docs/deskwork-plugin/prd.md`
- `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md`  (the actual file)
- Any other tree where `deskwork-plugin/prd.md` exists

In `--yes` mode doctor punts. Interactive mode probably shows a candidate list. That's reasonable — but **the originating ingest call already KNEW the file path it was binding** (it's literally what was passed to `deskwork ingest <path>`). The information just wasn't captured in the calendar row.

## What changes

Two complementary fixes:

1. **Bug-fix path** (covered by [#63](https://github.com/audiocontrol-org/deskwork/issues/63)): ingest writes `deskwork.id` to the file at apply time, so the binding never starts ambiguous.

2. **Defense-in-depth path**: when doctor detects an unbound calendar entry, look at the calendar's `Source` column (or a new `originalPath` field) to recover the path that was originally used. The current calendar row for `deskwork-plugin/prd` shows `manual` in the source column — losing the originating path.

The proposed `originalPath` (or `bindingHint`) field would let `--yes` doctor auto-fix the no-binding case by writing frontmatter to the path the ingest call recorded:

```
| 9845c268-... | deskwork-plugin/prd | Prd |  |  | manual | docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md |
```

## Acceptance

- After [#63](https://github.com/audiocontrol-org/deskwork/issues/63) ships, this finding shouldn't surface for fresh ingests. But for legacy / corrupted state, doctor in `--yes` mode resolves missing-frontmatter-id when an originating path is recoverable from the journal or calendar metadata.
- Calendar row shape captures enough provenance for doctor to reverse-engineer file paths without operator interaction.
- Interactive doctor still works as today — list candidate files and prompt — for cases where provenance is genuinely lost.

## Origin

Surfaced 2026-04-28 by `deskwork doctor --fix=missing-frontmatter-id --yes` skipping the unbound entry created by `/deskwork:ingest` (per [#63](https://github.com/audiocontrol-org/deskwork/issues/63)). Part of the Phase 23 dogfood arc.
<!-- SECTION:DESCRIPTION:END -->
