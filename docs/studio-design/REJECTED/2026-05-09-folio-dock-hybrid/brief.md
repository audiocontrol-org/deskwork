---
proposal: Folio-dock hybrid (stage spine + entry list)
status: REJECTED
date: 2026-05-09
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Folio-dock hybrid

## What

A hybrid mobile dashboard with a vertical "spine" of stage glyphs anchored to one viewport edge and a flat entry list filling the rest. Tapping a glyph on the spine would scroll the entry list to that stage's section. The intent was to combine the discoverability of stage groupings with the scanability of a flat list.

## Why rejected

Two issues compound:

1. **Cognitive overhead.** The spine + list pattern requires the operator to mentally align two parallel surfaces — "where is the spine pointing" versus "where is the list scrolled to." On phone, that alignment is fragile (the spine may scroll-out-of-view when the list scrolls past long sections). The collapsible-tiles direction folds the same information into one surface.
2. **Spine occupies thumb-reach real estate.** The spine sat on the leading edge of the viewport, which is the same real estate where iOS native back-swipe gestures originate. Tap-targets in that strip cause inadvertent navigation cancels. Moving the spine to the trailing edge moved it out of thumb-reach for right-handed phone use.

Both issues had partial mitigations, but the collapsible-tiles direction won on simplicity — one surface, one mental model.

## When

Rejected 2026-05-09. Mockup was originally drafted as `dashboard-3-folio-dock.html`; moved into this archive entry as the canonical visual.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
