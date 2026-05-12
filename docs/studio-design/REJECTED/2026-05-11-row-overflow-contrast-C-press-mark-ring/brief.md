---
proposal: Row ⋮ overflow button — Direction C (press-mark ring + faded glyph)
status: REJECTED
date: 2026-05-11
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../../../../plugins/deskwork-studio/public/mockups/row-overflow-contrast.html
---

# Row ⋮ overflow contrast — Direction C (press-mark ring + faded glyph)

## What

Proposed: ⋮ glyph in `var(--er-faded)` (#8A7F70, 3.53:1 against paper) inside a 26 × 26px circular ring with a 1px solid `var(--er-faded)` border (3.53:1). Both glyph and ring meet WCAG 2.1 SC 1.4.11 (3:1 floor for interactive UI components).

The intent: communicate the affordance via the *ring shape* rather than the glyph color. The ⋮ stays subdued (preserving the row-title's primary-content hierarchy) but the visible button boundary makes the affordance clearly tappable and on-component. The ring also reinforces the press-check vocabulary — stipple / press-mark / engraved-circle motifs already in the design language.

## Why rejected

The operator picked Direction B (bare ink-soft glyph, 11.06:1) over C primarily because **C adds a geometric primitive the row chrome doesn't currently use**. Row chrome today is rule-thin borders + cream paper + colored chips + Newsreader italic — no ring shapes anywhere else on the dashboard.

Other considerations:
- C's contrast budget (3.53:1 ring + 3.53:1 glyph) inherits Direction A's no-headroom problem — same palette-drift fragility for both parts of the affordance.
- The ring adds ~6px of trailing chrome per row vs the bare glyph. Minor density cost, but the v0.20 row redesign already paid careful attention to keeping the at-rest row "clean (slug + title + date + a low-contrast trailing ⋮)" — adding a ring puts more chrome where the brief explicitly asked for less.
- The "ring as press-check vocabulary reinforcement" argument is real but underweighted by the absence of any existing ring shapes in the dashboard's chrome — adding a ring just for the ⋮ creates an isolated motif rather than reinforcing a system.

## When

Rejected 2026-05-11 in the same review pass that accepted Direction B. Captured here so a future session weighing "should the ⋮ have a clearer button boundary?" can see the trade-offs without re-drawing the mockup.

If a different surface later wants a ring/circle motif (e.g. notification badge, FAB secondary action) the press-mark ring shape is available as prior art — the rejection is contextual to the dashboard row ⋮, not a categorical "no rings."

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
