---
id: TASK-8
title: >-
  writeSidecar serializes raw input, not Zod-validated result.data —
  retired/unknown fields can persist to disk
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-358
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/358

## Summary

`writeSidecar` (`packages/core/src/sidecar/write.ts`) validates the entry with `EntrySchema.safeParse` but then serializes the **original input object**, not the Zod-validated `result.data`:

```ts
const result = EntrySchema.safeParse(entry);
if (!result.success) { throw ... }
...
await writeFile(tmpPath, JSON.stringify(entry, null, 2));   // serializes `entry`, not `result.data`
```

Zod's strip produces a clean object in `result.data`, but it's discarded. So `writeSidecar` does NOT enforce schema cleanliness on write — it persists whatever extra keys the caller's runtime value carries. Unknown/retired fields (e.g. a legacy `reviewState`) survive a `writeSidecar` call if a caller's value has them.

## Why it currently doesn't bite

In normal typed usage, callers pass a `Entry` (no extra keys), so raw == clean. The retirement of `reviewState` is enforced on the READ side (`readSidecar` Zod-strips), so the approve/iterate read→write cycle drops it. The only way to persist a retired field is for a caller to bypass the type — e.g. a spread of legacy data, or an `as`-cast (which the project bans). So this is latent, not an active bug.

## Why it's worth hardening

`writeSidecar` already validates; making it the strip-and-serialize enforcement point closes the gap so a future type-bypassing caller can't silently re-introduce retired/unknown fields to disk. This is defense-in-depth for the Commandment III (`reviewState` retired) invariant.

## Fix

Serialize the validated data:

```ts
await writeFile(tmpPath, JSON.stringify(result.data, null, 2));
```

## Blast-radius caveat (why this needs its own focused change + test)

`writeSidecar` is on the hot path of every sidecar write (add/approve/iterate/block/cancel/induct/publish/repair). `result.data` reflects any Zod `.default()`/coercion the schema applies, which could differ from the raw input for edge cases. The change needs a dedicated test asserting (a) clean inputs serialize identically, (b) a planted unknown key (`reviewState`) is stripped on write. Out of scope for #232 (the calendarPath fix); surfaced by the `/dw-lifecycle:review` pass on commit 517159b.

Tracked under Phase 38 in `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md` (audit-log `AUDIT-20260529-05`).
<!-- SECTION:DESCRIPTION:END -->
