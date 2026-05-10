---
proposal: Three-tab bottom tab bar (Pipeline / Press / Folio)
status: REJECTED
date: 2026-05-09
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../2026-05-09-filing-tab-stamps-on-mobile/mockup.html
---

# Pipeline / Press / Folio tab bar

## What

A three-tab bottom tab bar for the mobile dashboard with tabs labeled "Pipeline," "Press," and "Folio." Each tab swapped the dashboard body to a different view: Pipeline = stage tiles + entries; Press = the in-review queue with reviewState-driven ordering; Folio = the operator's saved-for-later set.

## Why rejected

The "Press" tab depended on the retired `reviewState` concept — its central premise was "show me what's currently in review / iterating / approved" with reviewState-driven sort. With reviewState retired per `DESKWORK-STATE-MACHINE.md`, Press collapses into a slice of the Pipeline view (entries currently in Drafting, sorted by `updatedAt`) — there's no separate axis to surface.

Without Press, the three-tab bar collapsed to a two-tab (Pipeline + Folio), which doesn't justify the bottom-tab-bar pattern's footprint. The collapsible-tiles direction (which won) handled both Pipeline and a sketch of Folio (saved entries) within one surface.

The visual file for this proposal is the `dashboard-1c-filing-tab-fab.html` mockup that primarily backs [the filing-tab-stamps rejection](../2026-05-09-filing-tab-stamps-on-mobile/) and [the floating-compose-chip-fab acceptance](../../ACCEPTED/2026-05-09-floating-compose-chip-fab/). One mockup, three decisions — the cross-references make the relationships explicit.

## When

Rejected 2026-05-09. Visual is referenced by relative path; the mockup file lives under the filing-tab-stamps REJECTED entry.

## Feature reference

[docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/](../../../0.19.0/001-IN-PROGRESS/studio-mobile-first/)
