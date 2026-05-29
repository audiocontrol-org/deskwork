---
proposal: Remove the press-queue sidebar from the studio dashboard
status: ACCEPTED
date: 2026-05-09
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: N/A — non-visual decision (a removal)
deskwork:
  id: 4b6878ea-ec26-4b32-b7f1-7b8c75b4faf6
---

# Press-queue removed

## What

The studio dashboard's "press queue" sidebar — a column listing entries currently in review with their reviewState badges — is removed entirely. Both desktop and mobile.

## Why accepted

The press queue was a parallel surface for the retired `reviewState` concept. It rendered "in review / iterating / approved" badges as primary chrome and ordered entries by review-state activity. Both axes are no longer meaningful: per `DESKWORK-STATE-MACHINE.md` the system tracks stage, not review state, and the legacy stage `Review` was collapsed into `Drafting` in the 2026-04-30 pipeline redesign.

Two ways to "fix" this surface were considered: (a) reframe the queue around stages instead of reviewState, or (b) remove the surface. Removal won because the pipeline stages (rendered as collapsible tiles) already carry the same information — entries are visible under their stage tile, and the operator scans the pipeline shape rather than a separate queue. A second sidebar adds visual noise without surfacing data the stage tiles don't already show.

## When

Removed 2026-05-09 as part of the studio-mobile-first feature. The press-queue module (`packages/studio/src/pages/dashboard/press-queue.ts`) was deleted in commit `ffdcf35` after the dashboard's call site was removed.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
