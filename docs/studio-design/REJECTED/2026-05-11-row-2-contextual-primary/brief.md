---
proposal: Per-row affordance — contextual primary verb + overflow secondary (Direction 2)
status: REJECTED
date: 2026-05-11
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Row affordance — contextual primary

## What

Direction 2 of the per-row affordance design pass. Each row at-rest shows ONE primary verb chip on the trailing edge plus a smaller `⋮` for the secondary verbs. The primary verb is *contextualized* — it adapts to the row's current state to surface the operator's most-likely-next-action: an `in-review` row gets `approve →`, an `iterating` row gets `iterate →`, etc.

The pitch: the most-likely-next-action is always exactly one tap from the dashboard.

## Why rejected

Two reasons compound:

1. **The contextualization premise was built on `reviewState`.** Per `DESKWORK-STATE-MACHINE.md` Commandment III, reviewState is RETIRED — it isn't user-facing data and isn't surfaced anywhere on the dashboard. The mockup's "in-review → Approve, iterating → Iterate" contextual logic depended on review state being legible to the operator, which it no longer is. The mockup's banner already flagged this as needing a redraft on stage-graduation-based logic before being implementable.

2. **Stage-graduation-based contextualization is genuinely harder to get right.** Even if the contextual primary was re-derived from `currentStage` instead of `reviewState`, the right primary for Drafting depends on the operator's intent (iterate to continue working, or approve to advance). The dashboard can't reliably guess which the operator wants on any given row. Row 4 (`ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/`) sidesteps this by surfacing BOTH iterate and approve in the swipe drawer + menu, letting the operator pick.

## When

Originally drafted as part of Task 1.1.3's design pass. Retired 2026-05-11 when Row 4 was approved. The mockup file moves into this archive entry.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
