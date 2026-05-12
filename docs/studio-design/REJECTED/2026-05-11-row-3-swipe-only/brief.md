---
proposal: Per-row affordance — swipe gestures only (Direction 3)
status: REJECTED
date: 2026-05-11
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Row affordance — swipe only

## What

Direction 3 of the per-row affordance design pass. The row at-rest is maximally clean — no buttons, no chevron, no `⋮`. Tap-anywhere on the row opens the entry-review surface. To act on the row, the operator swipes left, which slides in an action drawer revealing colored verb chips (approve / iterate / cancel / scrapbook). iOS Mail / Material Design pattern.

The pitch: the cleanest possible at-rest composition; one gesture per action for power users.

## Why rejected

Superseded by the Row 4 hybrid (`ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/`), which keeps the same clean at-rest composition + swipe drawer but adds a discoverable `⋮` overflow button so new operators who don't know swipe exists aren't stranded.

The pure-swipe direction's main tradeoff was discoverability. Swipe is invisible — the operator either already knows it exists (iOS Mail muscle memory) or doesn't. A first-time adopter would see clean rows, click them, land on the review surface, and never realize they could approve / cancel from the dashboard without traversing the review surface. Coachmarks could mitigate it but ship friction.

The hybrid resolves the tradeoff: power users get swipe; discoverers find the `⋮`. The `⋮` adds a small visible chrome (one tiny low-contrast button per row) but is far less intrusive than the v0.19 stacked-button alternative the redesign is replacing.

## When

Originally drafted as part of Task 1.1.3's design pass. Retired 2026-05-11 when Row 4 was approved. The mockup file moves into this archive entry.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
