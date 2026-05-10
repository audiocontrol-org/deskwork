---
proposal: Collapsible stage tiles on mobile dashboard
status: ACCEPTED
date: 2026-05-09
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Collapsible stage tiles on mobile dashboard

## What

The mobile dashboard's pipeline stage rows render as collapsible tiles — each stage shows its glyph, name, and entry count in a compact strip; tapping the strip expands the tile to reveal the entries. Multiple tiles can be open simultaneously; the operator chooses what to focus on.

## Why accepted

The pre-redesign dashboard rendered every stage's entries flat, producing ~746px of scroll cost before the operator could see the first row. Compact 1 (this direction) reduced first-row-visible to ~96px by collapsing the stages-with-entries into single-row strips and letting the operator expand only the stage they care about. The operator's framing was *"favor structure over scrolling"* — and this direction made the pipeline shape visible without forcing scroll.

The collapsible-tile pattern also generalizes: empty stages collapse to one-line strips that still surface the stage's glyph and name, so the pipeline shape stays legible even when most stages are empty.

## When

Picked 2026-05-09 during the studio-mobile-first feature work. Implementation landed under Task 1.2 of the feature workplan.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
