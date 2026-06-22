---
id: TASK-148
title: >-
  stack-control: roadmap verb has no advance/set-status (completed phases stay
  'planned'; hand-edit forbidden)
status: Done
assignee: []
created_date: '2026-06-16 23:37'
updated_date: '2026-06-22 17:24'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-472
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`stackctl roadmap` has no way to advance a roadmap item's `status` (e.g. `planned` → `in-flight` → `done`). The verb only exposes `next | blocked | add`, and `ROADMAP.md` explicitly says "manage the graph with `stackctl roadmap` — do not hand-edit." So when a phase is completed, there is no supported way to update its status, and the roadmap drifts out of sync with reality.

## Repro

1. In a stack-control installation, complete a roadmap item (e.g. an `impl:feature/...` phase whose spec tasks are all checked off and audited).
2. Try to mark it done:
   ```
   stackctl roadmap
   # => roadmap: a subaction is required (usage: roadmap <next|blocked|add> [flags])
   ```
   There is no `advance`, `set-status`, `done`, or `update` subaction.
3. `stackctl roadmap reconcile` reports `status drift: 0` — it tracks spec-dir correspondences, not tasks.md checkbox completion, so it does not detect or propose the status advance either.

## Observed

After completing and fully auditing Phases 3 and 4 of `design-control` (specs/001-design-control), the roadmap still reads:

```
## impl:feature/phase-3-archive-status
- status: planned
## impl:feature/phase-4-referee-manifest-schema
- status: planned
```

with no CLI path to advance them, and the doc-grammar header forbids hand-editing.

## Impact

- Completed work reads as `planned`/`in-flight` indefinitely; the ready/blocked frontier reported by `session-start` is stale.
- The "do not hand-edit" guidance plus the missing verb leaves the operator with no sanctioned action.

## Suggested fix

- Add `stackctl roadmap advance <id> --to <status>` (or `set-status`), validated against the doc-grammar's allowed statuses, mirroring the dry-run-then-apply pattern other mutating verbs use.
- Optionally, have `roadmap reconcile` detect tasks.md-checkbox completion for an item's linked spec and *propose* (never auto-apply) the status advance.

Found while dogfooding `design-control` (2026-06-14).
<!-- SECTION:DESCRIPTION:END -->
