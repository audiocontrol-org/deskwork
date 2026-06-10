---
id: TASK-6
title: >-
  perf(graphical-entries): group cancel --cascade runs regenerateCalendar N+1
  times
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-360
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/360

## Summary

`cancelEntry` (`packages/core/src/entry/cancel.ts:225`) runs `regenerateCalendar(projectRoot)` once per invocation. The cascade path (`cancel.ts:193`) recursively invokes `cancelEntry` for every cascaded member, so cancelling a group with N members triggers **N+1 full sidecar re-reads + N+1 `calendar.md` writes**. Quadratic disk I/O on large groups; the inner regenerations don't compound to incorrect state (each cancel finalizes its own write before the next regenerate reads), but the work is wasted.

## Reproduction

```bash
# Create a group with 10 members all in Drafting
deskwork group create big-group --lane default
for i in 1..10; do
  deskwork add member-$i --lane default
  deskwork group add-member big-group member-$i
done

# Cascade-cancel the group
time deskwork cancel big-group --cascade
```

Observe: `calendar.md` is rewritten 11 times during the single cascade.

## Why this matters

- **Performance on large groups.** For a 100-member group, regenerateCalendar runs 101 times. Each regeneration walks every sidecar in the project; on a project with K total entries, the cascade does O(N·K) work where O(N+K) suffices.
- **Concurrent-edit safety.** Multiple regenerations create more windows for concurrent edits to interleave with the cascade's mid-state writes. Not currently a known bug, but the surface area is larger than it needs to be.
- **Test fixture noise.** Cascade tests that snapshot `calendar.md` see 11 intermediate states; only the final state matters.

## Recommended fix

Split `cancelEntry` into two functions:

1. **Private walker `cancelEntryWithoutCalendarRegen(projectRoot, slug, opts)`**: does the per-entry transition + journal append + sidecar write but does NOT call `regenerateCalendar`. Used internally by the cascade walk.
2. **Public `cancelEntry(projectRoot, slug, opts)`**: calls the walker for the head entry + every cascaded member, then calls `regenerateCalendar` ONCE at the boundary.

The cascade walk in `cancel.ts:193` swaps `cancelEntry` for `cancelEntryWithoutCalendarRegen`; the top-level `cancelEntry` is responsible for the single final regenerate.

## Surfaced by

Track 3 code-quality review of `15dd424` (Phase 7 Task 7.2 commit). Audit-log entry AUDIT-20260529-18.

## Out of scope

- Refactoring other entry-mutation verbs (`approve`, `iterate`, `publish`, `block`, `induct`) into the same walker / wrapper split. Those don't currently have cascade behavior, so the N+1 doesn't surface there. If a future feature adds cascade to them (e.g. `block --cascade` for blocking a whole group), the same refactor applies.

## Acceptance criteria

- [ ] `cancelEntry` split into walker + wrapper as above.
- [ ] Cascade test asserts `calendar.md` is rewritten exactly once per cascade (snapshot file mtime or a regenerate-counter test seam).
- [ ] No behavior change for single-entry (non-cascade) cancel: still one regenerate, identical result shape.
- [ ] Test count delta: +1 (calendar-regenerate-count assertion).
<!-- SECTION:DESCRIPTION:END -->
