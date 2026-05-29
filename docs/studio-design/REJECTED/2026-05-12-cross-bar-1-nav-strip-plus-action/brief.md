---
proposal: Cross-bar 1 — Nav strip + per-surface action region (two stacked bars)
status: REJECTED
date: 2026-05-12
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../../../../plugins/deskwork-studio/public/mockups/cross-bar-1-nav-strip-plus-action.html
---

# Cross-bar 1 — Nav strip + per-surface action region (two stacked bars)

## What

Two stacked bars at the bottom of every studio surface. The lower bar is a 44px universal nav strip carrying three top-level destinations (Desk · Shortform · Manual). The upper bar is a 52px surface-specific action region — sticky pills for review surfaces (Iter / Apprv / Cancel), chip-tabs for entry-review longform (Outline / Notes / Scrapbook / Actions), or a floating Compose chip for the dashboard. Total: 96px of bottom chrome on surfaces with both regions; 44px on lighter surfaces (Manual).

## Why rejected

The hard separation between nav and action was the proposal's argument for itself: *"the bar's left side is global navigation; the right side is surface action; one job per region."* That separation is sound conceptually. In practice the operator preferred a different separation: the masthead handles navigation; the bar handles action. The v4 refinement collapsed nav out of the bar entirely (Desk-as-hub model), making this direction's premise — "the bar carries nav" — obsolete.

The trade-off the proposal accepted (96px bottom chrome on heavy surfaces) was rejected by the simpler-is-better trajectory of v2 → v3 → v4. By the time v4 landed, the case for any bar nav region had evaporated — Desk as a hub absorbs all destinations.

## When

Documented 2026-05-12 alongside the v7 ACCEPTED entry; superseded by the v4 → v7 simplification trajectory.

## Feature reference

`docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/`
