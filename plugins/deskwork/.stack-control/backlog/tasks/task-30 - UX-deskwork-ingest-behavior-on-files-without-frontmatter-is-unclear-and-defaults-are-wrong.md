---
id: TASK-30
title: >-
  UX: /deskwork:ingest behavior on files without frontmatter is unclear and
  defaults are wrong
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-62
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/62

## Friction surfaced during 2026-04-28 dogfood

`/deskwork:ingest` is documented as the right way to backfill existing markdown into the calendar. But the skill's behavior for files with **no YAML frontmatter at all** is unclear and (in dry-run output) wrong:

```
$ deskwork ingest docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md
Plan: 1 add, 0 skip (dry-run; pass --apply to commit)

add  deskwork-plugin/prd       Ideas       2026-04-28    slug:path state:default date:mtime
```

Two problems:

### Problem 1: Default-to-`Ideas` is wrong for legacy active docs

The PRD has no `state:` field, so the helper defaults to `Ideas`. But the file's existence — multi-thousand-word body, multiple sections, hundreds of edit sessions — clearly means it's past Ideas. *"No frontmatter"* in a legacy doc usually means *"this file predates frontmatter conventions,"* not *"this is a brand-new idea I just had."*

Suggested heuristic for inferring state when no `state:` field is present:
- File body length > some threshold (e.g. > 500 chars beyond the first heading) → at least `Drafting`.
- File has acceptance-criteria / status-table / changelog markers → `Drafting` or `Review`.
- `dateModified` / mtime is more than N days ago → not `Ideas`.

Or: when no `state:` field exists, **skip with `state ambiguous`** rather than silently defaulting. Force the operator to explicitly pass `--state` or add the frontmatter. The current behavior (silent default) creates wrong calendar entries.

### Problem 2: What does `--apply` even do for a file with no frontmatter?

Does `ingest --apply` on a file with no frontmatter:

a) Add YAML frontmatter to the file (with `deskwork.id` UUID + `state` + `date`)?
b) Refuse to bind the calendar entry to the file (no UUID = no binding)?
c) Add only the calendar row, leaving the file untouched?

The skill prose doesn't say. The doctor rules ([#33](https://github.com/audiocontrol-org/deskwork/issues/33)) imply binding requires `deskwork.id` in frontmatter — so without it, the entry is unbound — but ingest's docs don't surface this.

Suggested fix: `ingest --apply` on a file without frontmatter should either:

1. **Write `deskwork:` frontmatter to the file** (with the UUID it generates for the calendar row), creating the binding atomically. This is the intuitive behavior — you ingest a file, the file gets bound.
2. **Refuse with a clear error** — *"file has no frontmatter; add a `---` block with at least `deskwork:` namespace before ingesting, or pass `--write-frontmatter` to have ingest add it for you."*

Option 1 with an explicit `--write-frontmatter` opt-in (or opt-out) is cleanest — surfaces the file mutation explicitly.

### Problem 3: Date inference falls to mtime, which captures last edit

For the PRD, mtime is yesterday (2026-04-28). The PRD was first created weeks ago when the deskwork-plugin feature started. mtime as the editorial-calendar date is misleading.

Better waterfall:
1. `datePublished` frontmatter
2. `dateModified` frontmatter (only if the doc claims publication)
3. `date` frontmatter (generic)
4. **First commit date for this file** (`git log --diff-filter=A --format=%aI -- <file>`) — captures editorial creation, not last edit
5. mtime (current behavior — last fallback)

For the no-frontmatter case, falling back to first-commit date would have captured a more accurate editorial date for the PRD.

## Acceptance

- `ingest` on a file without frontmatter either writes `deskwork:` frontmatter to it (per `--write-frontmatter` flag, default behavior TBD) or refuses with a clear error.
- State inference for files without `state:` frontmatter consults file size / git history / mtime before defaulting to `Ideas`. Or skips with `state ambiguous` and lets the operator pass `--state`.
- Date inference falls through git history (first-commit date) before mtime.
- The skill prose documents the no-frontmatter case explicitly.

## Origin

Surfaced 2026-04-28 by ingesting the omnibus deskwork-plugin PRD at `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md`. The dry-run plan shows it landing in `Ideas` with mtime as the date — both wrong. Part of the Phase 23 dogfood arc.
<!-- SECTION:DESCRIPTION:END -->
