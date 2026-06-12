---
id: TASK-22
title: >-
  feat(graphical-entries): wire member-of pull-tab on mobile lane-stack +
  desktop list-mode-body (Track 2 HIGH from b642cd6)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - bug
  - enhancement
dependencies: []
references:
  - gh-371
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Phase 7 Tasks 7.3 + 7.4 shipped the kraft member-of pull-tab on lane dashboard rows (per accepted Direction 1 at `docs/studio-design/ACCEPTED/2026-05-29-group-review-surface/`), but the implementation wires it only to the **desktop kanban swim path** (`renderRow` in `packages/studio/src/pages/dashboard/section.ts`). The **mobile lane-stack** rendering (the primary viewport per the brief's mobile-first stance and the picked mockup, rendered at iPhone-13 viewport 390×844) does NOT render the affordance. A mobile operator cannot discover that an entry belongs to a group.

## Surfaced by

Track 2 spec-compliance review of `b642cd6` (Phase 7 Tasks 7.3 + 7.4 implementation commit). Audit-log entry `AUDIT-20260529-34`. Severity: HIGH (the picked direction was mobile-first; the primary surface does not deliver it).

## Why this matters

The mobile dashboard is the dominant access path for the editorial calendar per the v0.19 dashboard rebuild + the deskwork-studio mobile-first design. Member-of relationships are part of the operator's mental model for cross-group editorial work (e.g., a draft that lives in multiple group rebuilds). Without surfacing the relationship on mobile rows, the operator must navigate to the entry's review surface to discover its group membership — a multi-step path that defeats the design intent.

## Implementation notes (carry forward from Track 2)

The desktop swim path uses `.er-row-shell` chrome (composed by `renderRow` in `packages/studio/src/pages/dashboard/section.ts`). The mobile lane-stack uses different chrome:

- **`.lb-row`** in `packages/studio/src/pages/dashboard/lane-stack-card.ts` (mobile lane-stack list rendering)
- **`.lb-row`** also surfaces in `packages/studio/src/pages/dashboard/swimlane-list-body.ts` (desktop list-mode within a swimlane — the same chrome)

The implementation work is a sibling rendering pass:

1. Thread `parentsByMemberUuid` (already built in `loadDashboardData()`) through to both `lane-stack-card.ts` and `swimlane-list-body.ts` render functions.
2. Add the `.er-row-member-tab` element to the `.lb-row` chrome's left edge, mirroring the desktop kanban variant.
3. CSS likely needs `.lb-row` variant rules — the existing `.er-row-shell.has-member-tab` rule won't compose; add equivalent rules for `.lb-row.has-member-tab`.
4. Verify the pull-tab's hit-area meets WCAG 2.5.8 (24×24) in both row chromes.
5. Extend the existing `dashboard-member-row-badge.test.ts` (or add a parallel `dashboard-member-row-badge-mobile.test.ts`) to assert the affordance renders in both viewport classes.

## Acceptance criteria

- [ ] Mobile lane-stack renders `.er-row-member-tab` on member rows.
- [ ] Desktop list-mode-within-swimlane renders the same.
- [ ] Both share the popover expansion behavior.
- [ ] Tab hit-area meets WCAG 2.5.8 (24×24) in both row chromes.
- [ ] Tests assert presence in both viewport classes.
- [ ] AUDIT-20260529-34 Status flips to `fixed-<sha>` when the work lands.

## Scope

Tracked as **workplan Step 7.3.5** in `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md`. Phase 7 closeout (`/dw-lifecycle:complete`) is BLOCKED on this step landing — the workplan's no-bare-TBDs gate will refuse to graduate the feature until the step is checked off.

## Defer-rationale

Splitting the work from the original Tasks 7.3 + 7.4 commit. The desktop kanban path is the more common operator viewport in the editorial-studio context (long horizontal kanban grids), AND the wire-up shape for the mobile lane-stack requires understanding the `.lb-row` chrome's existing affordance composition (drawer, swipe gestures, menu). Filing as its own scope-bounded step keeps the audit narrative clean. The deferral is recorded in BOTH the workplan AND this issue per the project's two-track recording rule.

## Out of scope

- Filing additional discoverability affordances elsewhere on the mobile dashboard (this issue is scoped to parity with the desktop kanban pull-tab).
- Designing a new mobile-bespoke affordance (the picked Direction 1 mockup IS the design; the implementation just needs to land it on the mobile chrome).
<!-- SECTION:DESCRIPTION:END -->
