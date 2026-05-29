---
proposal: Cross-bar 2 refinement v3 — collapsed destination picker (single cell + sheet)
status: REJECTED
date: 2026-05-12
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../../../../plugins/deskwork-studio/public/mockups/cross-bar-2-refined-v3-collapsed-picker.html
---

# Cross-bar 2 refinement v3 — collapsed destination picker

## What

The bar's left side becomes one *picker cell* showing the current destination's glyph + name + chevron (`▾`). Tap → slide-up sheet listing every studio destination (Desk · Short · Manual · future destinations as dimmed rows with phase tags). Pick → navigate + sheet closes. Contextual region grows to 1-5 cells. The bar reads "where am I / go elsewhere" (1 cell) | kraft hairline | "do work here" (1-5 cells).

## Why rejected

v3 was operator-framed as the asymptote of "enumerate options vs collapse to one affordance" — and it was the right answer for *that* question. But operator's next framing surfaced a deeper simplification: *"we might be able to get away with just a link to the desk, since there's a link to the shortform workflow from the desk (or, there should be). That makes the Desk the hub of all activity — the home base."* v4 dropped the picker entirely. The picker sheet's destination list became unnecessary once Desk absorbed all destinations as IA sections rather than nav targets.

v3's other implicit issue: the slide-up sheet revealed FROM the bottom while the picker cell trigger lived on the bar (which is bottom-anchored — OK spatial model). But the same sheet pattern leaked into v5/v6 for the masthead menu where it was spatially wrong (v6 → v7 corrected it via popover).

## When

Documented 2026-05-12; superseded by v4 (Desk-as-hub).

## Feature reference

`docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/`
