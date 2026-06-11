---
id: TASK-21
title: >-
  feat(graphical-entries): composed view should surface unrouted-members
  indicator (Track 3 LOW from b642cd6)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-372
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

The group review surface's composed multi-lane view (Phase 7 Task 7.4) silently drops members whose `lane` field is undefined OR whose `lane` is not present in the loaded `laneConfigsById`. In **list view** these members still render with `.er-member-row.lane-unrouted` styling and the raw lane id; in **composed view** they vanish with no visible count discrepancy on the toggle.

The operator cannot tell composed view shows fewer entries unless they cross-check totals between modes.

## Surfaced by

Track 3 code-quality review of `b642cd6` (Phase 7 Tasks 7.3 + 7.4 implementation commit). Audit-log entry `AUDIT-20260529-35`. Severity: LOW (the doctor `group-member-missing` rule, Task 7.5.2, surfaces a partially-overlapping signal, but the mid-mode discrepancy is still its own UX concern).

## Why this matters

Operators who use the toggle to compare flat-list and composed views (the picked Direction B design explicitly supports both modes) can get a misleading mental model of the group's membership state if some members are unrouted. The list view is the source of truth; the composed view silently degrades.

## Recommended fix

Add an "unrouted" indicator to the composed view's chrome:

- Compute the unrouted count in `bucketMembersByLane` (return both `buckets` and `unroutedMembers`).
- Pass `unroutedMembers.length` to `renderComposedBody`.
- When `unroutedMembers.length > 0`, render a small one-line indicator above the swimlanes: e.g., `<div class="er-members-unrouted-indicator">⚠ N members unrouted — switch to list view to see them</div>`.
- Test coverage: extend `entry-review-group-members-section-composed.test.ts` with a fixture that has 1 routed + 1 unrouted member; assert the indicator renders.

## Acceptance criteria

- [ ] Composed view renders unrouted-count indicator when `unroutedMembers.length > 0`.
- [ ] Test asserts the indicator render path.
- [ ] AUDIT-20260529-35 Status flips to `fixed-<sha>` when the work lands.

## Defer-rationale

Smaller surface area than the AUDIT-34 mobile lane-stack gap; orthogonal to the picked Direction B's primary acceptance criteria; the doctor rule (Task 7.5.2) provides a partial signal for the operator-facing case. Filing as a low-severity follow-up rather than expanding the Tasks 7.3/7.4 commit further.

## Out of scope

- Cross-coupling the composed view's count signal with doctor-rule findings (doctor stays the canonical source for repair flows; this issue is about UI parity between two view modes of the same data).
- Adding the indicator to list view (list view already shows the unrouted members directly with `.lane-unrouted` styling).
<!-- SECTION:DESCRIPTION:END -->
