---
id: TASK-297
title: >-
  stackctl backlog done drops --reason — the closure rationale is printed but
  never persisted to the task file
status: To Do
assignee: []
created_date: '2026-06-19 07:48'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 297000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-scoped 2026-06-22: the closure VERB now exists (`backlog done <id> --reason ... --apply`, backlog.ts emitDone) and the status transition To Do → Done persists correctly. Surviving gap: `--reason` is validated and printed but NEVER written to disk. Trace: backlog.ts:153 reads/validates the reason; backlog.ts:171 calls `backend.close(id)` WITHOUT the reason; backend.ts:75 `close(id: string): void` interface has no reason param; backend.ts:362-366 only runs `task edit <id> -s Done`. The auto-reconcile path (reconcile-fixed.ts:72) also drops it. Empirically confirmed: tasks closed on 2026-06-22 (task-74, -70, -183, etc.) carry `status: Done` but no reason field anywhere in the file. The done.test.ts test (line 20/25) passes --reason but only asserts the status, so the drop is unguarded.

Fix: thread the reason through `BacklogBackend.close(id, reason?)` and write it into the task body/frontmatter (e.g. an Implementation-Notes closure line or a `closure_reason` frontmatter field), then extend done.test.ts to assert the reason is on disk. Original framing (no closure verb at all) is satisfied; this is the persistence remnant. Verified via source + empirical 2026-06-22.
<!-- SECTION:DESCRIPTION:END -->
