---
proposal: Rotated rubber-stamp state chrome on mobile dashboard rows
status: REJECTED
date: 2026-05-09
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Rotated rubber-stamp state chrome

## What

Each mobile dashboard row would carry a rotated rubber-stamp graphic in its corner showing the entry's state ("IN REVIEW", "ITERATING", "APPROVED"). The stamp was the visual primary, rotated 8–12° for press-check authenticity, rendered in the press-check accent palette (red-pencil for active, stamp-green for approved, etc.).

## Why rejected

Three reasons compound:

1. **Review state is RETIRED.** Per `DESKWORK-STATE-MACHINE.md`, the system tracks stage (eight states), not review state. A stamp surfacing "IN REVIEW" / "APPROVED" rendered a concept that was no longer meaningful — the visual primary was retired data. This alone is disqualifying.
2. **Vertical-stack visual noise.** Even if the labels were re-cast as stages, a rotated stamp on every row in a vertical list produces visual noise that competes with the row content (title, slug, updated time). The rotation amplifies the chrome's footprint disproportionate to its information density.
3. **Mobile thumb-reach.** Stamps that are visually prominent imply tap-affordance, but they didn't carry any. Operators would attempt to tap them and nothing would happen — a discoverability false-positive.

The rubber-stamp conceit retains value on the desktop hero strips and the entry-review surface where state IS the primary information; it is retired on mobile dashboard rows specifically.

## When

Rejected 2026-05-09 during the dashboard-mobile-first design exploration. The mockup was originally drafted as `dashboard-1-press-tabs.html`; moved into this archive entry as the canonical visual.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
