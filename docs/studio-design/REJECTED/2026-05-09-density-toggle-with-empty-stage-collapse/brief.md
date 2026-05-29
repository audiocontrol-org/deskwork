---
proposal: Density toggle + auto-collapse of empty stages
status: REJECTED
date: 2026-05-09
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Density toggle with empty-stage collapse

## What

An alternative compactness exploration: a "compact / comfortable" density toggle in the dashboard header that switched the row chrome between two heights, paired with auto-collapsing of empty stage groups. The intent was to give the operator manual control over information density while saving vertical space on stages that didn't have any entries.

## Why rejected

The density toggle is a setting the operator has to think about and choose between. It exposes a UX tradeoff (compactness vs. legibility) as a recurring decision point instead of resolving it. The collapsible-tiles direction (which won) instead makes density automatic — collapsed-by-default, expand-when-needed — without asking the operator to pick a global preference.

The empty-stage auto-collapse part of this proposal was actually compatible with the collapsible-tiles direction and survived in some form: empty stages render as one-line strips. The piece that was rejected was specifically the *density toggle as a global UI setting*.

## When

Rejected 2026-05-09 during the compactness-exploration design pass. Mockup was originally drafted as `dashboard-compact-2-density-toggle.html`; moved into this archive entry as the canonical visual.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
