---
proposal: Floating compose-chip FAB for new-entry creation on mobile dashboard
status: ACCEPTED
date: 2026-05-09
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../../REJECTED/2026-05-09-filing-tab-stamps-on-mobile/mockup.html
---

# Floating compose-chip FAB

## What

A floating action button on the mobile dashboard that opens a new-entry composer. Surfaced as a small chip with a compose glyph + label, anchored to the lower-right of the viewport above the safe-area inset. Tap → composer sheet opens.

## Why accepted

Mobile dashboards need a primary creation affordance that isn't buried in a menu or stuck behind a tap-on-row gesture. The FAB pattern is platform-native (iOS/Android both ship it), thumb-reachable, and consistent across surfaces. The chip-shape variant (label + glyph, not just glyph) was picked over the bare-circle FAB because the dashboard has multiple latent verbs (add, ingest, scrap), and the chip's label disambiguates which verb fires.

The visual was originally part of the `dashboard-1c-filing-tab-fab` mockup. Only the FAB pattern was accepted; the filing-tab-stamps direction that wrapped it was REJECTED on the same day (see [REJECTED/2026-05-09-filing-tab-stamps-on-mobile/](../../REJECTED/2026-05-09-filing-tab-stamps-on-mobile/)).

## When

Picked 2026-05-09 alongside the row-affordance direction. Implementation landed under Task 1.2 of the feature workplan.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
